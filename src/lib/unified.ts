/**
 * Samler oppgaver fra Brainbord (skolens data), Canvas og Teams til én liste
 * og slår sammen duplikater (samme oppgave publisert i flere systemer).
 * Rene funksjoner uten I/O – testes i tests/unified.test.ts.
 */
import type { LinkKind, LinkPlatform, OpenLink } from './links';

export type SourceKey = 'skolehub' | 'canvas' | 'teams';
export type UStatus = 'levert' | 'pagar' | 'ikke_levert' | 'forfalt' | 'vurdert' | null;
/** Status eleven selv kan velge */
export type MyStatus = 'ikke_levert' | 'pagar' | 'levert';

/** Én kilde for en oppgave. url = original lenke fra API-et; platform = systemet lenken går til. */
export interface SourceRef {
  source: SourceKey; id: string; url: string | null; via?: string | null;
  platform?: LinkPlatform; linkKind?: LinkKind | null; externalId?: string | null; courseId?: string | null; internalUrl?: string | null;
}
export interface TaskInput {
  source: SourceKey; id: string; title: string; courseName: string | null; dueAt: string | null;
  kind: 'oppgave' | 'prove'; activityType?: string | null; status: UStatus; grade?: string | null; body?: string | null;
  url: string | null; via?: string | null; submittedAt?: string | null;
  platform?: LinkPlatform; linkKind?: LinkKind | null; externalId?: string | null; courseId?: string | null; internalUrl?: string | null;
}
export interface UnifiedTask {
  key: string; title: string; courseName: string | null; dueAt: string | null; kind: 'oppgave' | 'prove'; activityType: string | null;
  status: UStatus; grade: string | null; body: string | null; sources: SourceRef[];
  /** Beste lenke til kildesystemet (settes av unified-data med riktig konfig) */
  open?: OpenLink | null;
  /** Eleven har huket av «Løst» i planen (personlig markering) */
  solvedAt?: string | null;
  /** Eleven har selv satt status på en Canvas-/Teams-oppgave; kildens egen status */
  myStatus?: MyStatus | null;
  sourceStatus?: UStatus;
  /** Når oppgaven sist ble levert/huket av som levert (nyeste tidspunkt fra kildene eller eleven) */
  deliveredAt?: string | null;
}

export const SOURCE_LABEL: Record<SourceKey, string> = { skolehub: 'Brainbord', canvas: 'Canvas', teams: 'Teams' };

export function normTitle(s: string) {
  return s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9æøåäöü ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export const osloDay = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });

function tokens(s: string) { return new Set(normTitle(s).split(' ').filter((w) => w.length > 1)); }
function similar(a: string, b: string) {
  const na = normTitle(a), nb = normTitle(b);
  if (na === nb) return true;
  if (na.length > 6 && nb.length > 6 && (na.includes(nb) || nb.includes(na))) return true;
  const A = tokens(a), B = tokens(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size) >= 0.75;
}

/** Status når flere kilder er uenige: innlevert ett sted = innlevert */
export function mergeStatus(list: UStatus[], dueAt: string | null, now: number): UStatus {
  if (list.every((s) => s === null)) return null;
  if (list.includes('vurdert')) return 'vurdert';
  if (list.includes('levert')) return 'levert';
  if (list.includes('pagar')) return 'pagar';
  if (dueAt && Date.parse(dueAt) < now) return 'forfalt';
  return 'ikke_levert';
}

/**
 * Duplikater = samme frist-dag (norsk tid) og lik/nesten lik tittel.
 * Oppgaver fra samme kilde slås aldri sammen med hverandre.
 */
export function unifyTasks(input: TaskInput[], now: number): UnifiedTask[] {
  const groups: TaskInput[][] = [];
  const byDay = new Map<string, TaskInput[][]>();
  for (const t of input) {
    const day = t.dueAt ? osloDay(t.dueAt) : 'uten-frist';
    const bucket = byDay.get(day) ?? [];
    const g = day === 'uten-frist' ? undefined
      : bucket.find((grp) => !grp.some((x) => x.source === t.source) && similar(grp[0].title, t.title));
    if (g) g.push(t); else { const ng = [t]; bucket.push(ng); groups.push(ng); }
    byDay.set(day, bucket);
  }
  return groups.map((g): UnifiedTask => {
    // Foretrekk detaljene fra kilden med mest informasjon (lengst beskrivelse)
    const main = [...g].sort((a, b) => (b.body?.length ?? 0) - (a.body?.length ?? 0))[0];
    return {
      key: g.map((x) => `${x.source}:${x.id}`).sort().join('+'),
      title: main.title, courseName: g.find((x) => x.courseName)?.courseName ?? null, dueAt: main.dueAt,
      kind: g.some((x) => x.kind === 'prove') ? 'prove' : 'oppgave', activityType: g.find((x) => x.activityType)?.activityType ?? null,
      status: mergeStatus(g.map((x) => x.status), main.dueAt, now), grade: g.find((x) => x.grade)?.grade ?? null,
      deliveredAt: g.map((x) => x.submittedAt).filter((d): d is string => !!d).sort().at(-1) ?? null,
      body: main.body ?? null,
      sources: g.map((x) => ({ source: x.source, id: x.id, url: x.url, via: x.via ?? null, platform: x.platform, linkKind: x.linkKind ?? null,
        externalId: x.externalId ?? null, courseId: x.courseId ?? null, internalUrl: x.internalUrl ?? null })),
    };
  }).sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
}

export type Urgency = 'forfalt' | 'idag' | 'snart' | 'uke' | 'senere' | 'ferdig';
export function urgency(t: Pick<UnifiedTask, 'dueAt' | 'status'>, now: number): Urgency {
  if (t.status === 'levert' || t.status === 'vurdert') return 'ferdig';
  if (!t.dueAt) return 'senere';
  const h = (Date.parse(t.dueAt) - now) / 3_600_000;
  if (h < 0) return 'forfalt';
  if (osloDay(t.dueAt) === osloDay(new Date(now).toISOString())) return 'idag';
  if (h < 72) return 'snart';
  if (h < 168) return 'uke';
  return 'senere';
}

/**
 * Elevens egen status (Canvas/Teams) overstyrer kildens status i Brainbord.
 * «Ikke levert» etter fristen vises som «Forfalt».
 */
export function applyMyStatus(t: UnifiedTask, mine: MyStatus | null | undefined, now: number, mineAt?: string | null): UnifiedTask {
  if (!mine) return t;
  const status: UStatus = mine === 'ikke_levert' && t.dueAt && Date.parse(t.dueAt) < now ? 'forfalt' : mine;
  return { ...t, status, myStatus: mine, sourceStatus: t.status,
    // Huket av som levert av eleven: det tidspunktet teller; ellers er oppgaven ikke levert
    deliveredAt: mine === 'levert' ? (mineAt ?? t.deliveredAt ?? null) : null };
}

/** Leverte/vurderte oppgaver: sist levert øverst (nyest til eldst). Uten tidspunkt: sist frist først. */
export function sortDelivered(tasks: UnifiedTask[]): UnifiedTask[] {
  const key = (t: UnifiedTask) => t.deliveredAt ?? '';
  return [...tasks].sort((a, b) => key(b).localeCompare(key(a)) || (b.dueAt ?? '').localeCompare(a.dueAt ?? ''));
}
