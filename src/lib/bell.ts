/**
 * Varselbjelle. Prioritet etter tid til frist:
 *   P1 = utløpt, P2 = 0–7 dager, P3 = 7–15 dager, P4 = 15–30 dager.
 * Leverte/vurderte oppgaver tas ikke med. Varseltallet teller bare P1 (utløpte).
 * Sortert med tidligste frist først.
 */
import type { OpenLink } from './links';
import type { UnifiedTask } from './unified';

export type Priority = 1 | 2 | 3 | 4;
export interface BellItem { key: string; refs: { source: string; id: string }[]; title: string; courseName: string | null; dueAt: string; kind: 'oppgave' | 'prove'; priority: Priority; late: boolean; sources: string[]; open: OpenLink | null }

export function priorityOf(dueAt: string, now: number): Priority | null {
  const days = (Date.parse(dueAt) - now) / 86_400_000;
  if (days < 0) return 1;
  if (days <= 7) return 2;
  if (days <= 15) return 3;
  if (days <= 30) return 4;
  return null;
}

export function bellItems(tasks: UnifiedTask[], now: number): { items: BellItem[]; lateCount: number } {
  const items = tasks
    // Leverte, vurderte og oppgaver eleven har huket av som løst tas ikke med
    .filter((t) => t.dueAt && t.status !== 'levert' && t.status !== 'vurdert' && !t.solvedAt)
    .map((t) => ({ t, p: priorityOf(t.dueAt!, now) }))
    .filter((x): x is { t: UnifiedTask; p: Priority } => x.p !== null)
    .sort((a, b) => Date.parse(a.t.dueAt!) - Date.parse(b.t.dueAt!))
    .map(({ t, p }) => ({ key: t.key, refs: t.sources.map((s) => ({ source: s.source, id: s.id })), title: t.title, courseName: t.courseName, dueAt: t.dueAt!, kind: t.kind, priority: p, late: p === 1,
      sources: t.sources.map((s) => s.source), open: t.open ?? null }));
  return { items, lateCount: items.filter((i) => i.late).length };
}
