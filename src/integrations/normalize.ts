import type { ActivityType, NormalizedActivity } from './types';

/** Gjetter aktivitetstype ut fra tittel når plattformen ikke har typen */
export function classifyByTitle(title: string, fallback: ActivityType = 'innlevering'): ActivityType {
  const t = title.toLowerCase();
  if (/\beksamen|\bexam\b/.test(t)) return 'eksamen';
  if (/\bprøve|\bheldagsprøve|\btentamen|\bquiz|\btest\b/.test(t)) return 'prove';
  if (/presentasjon|fremføring|framføring|muntlig|pitch/.test(t)) return 'presentasjon';
  if (/prosjekt|project/.test(t)) return 'prosjekt';
  if (/\blekse|homework|\bles kap/.test(t)) return 'lekse';
  if (/\bfrist\b|påmelding|deadline/.test(t)) return 'frist';
  return fallback;
}

export const isTestType = (t: ActivityType) => t === 'prove' || t === 'eksamen';

/** Fjerner HTML fra beskrivelser (Canvas/Teams leverer HTML) og begrenser lengde */
export function stripHtml(html: string | null | undefined, max = 2000): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text || null;
}

/** Stabil hash (FNV-1a) – gir faste externalId for kilder uten egne ID-er */
export function stableId(...parts: (string | null | undefined)[]): string {
  let h = 0x811c9dc5;
  const s = parts.map((p) => (p ?? '').trim().toLowerCase()).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'h' + h.toString(16).padStart(8, '0');
}

/** Duplikatkontroll innen én batch: samme externalId => behold siste */
export function dedupe<T extends { externalId: string }>(items: T[]): { unique: T[]; duplicates: number } {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.externalId, it);
  return { unique: [...map.values()], duplicates: items.length - map.size };
}

export function isValidIso(d: string | null | undefined): d is string {
  return !!d && !Number.isNaN(Date.parse(d));
}

/** Godtar bare absolutte https-lenker uten innebygd brukernavn/passord */
export function httpsOrNull(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return null;
  try { const x = new URL(u.trim()); return x.protocol === 'https:' && !x.username && !x.password ? x.toString() : null; } catch { return null; }
}

export function validateActivity(a: NormalizedActivity): string | null {
  if (!a.title?.trim()) return 'Mangler tittel';
  if (!isValidIso(a.dueAt)) return `Ugyldig dato/frist: ${a.dueAt}`;
  if (a.startsAt && !isValidIso(a.startsAt)) return `Ugyldig startdato: ${a.startsAt}`;
  if (a.title.length > 300) return 'Tittel er for lang (maks 300 tegn)';
  return null;
}
