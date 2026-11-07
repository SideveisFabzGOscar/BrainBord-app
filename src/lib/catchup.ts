/**
 * Gjennomføringsplan for å komme à jour.
 *  - Har eleven P1/P2-oppgaver: P1 først (tidligst frist først), deretter P2.
 *  - Ingen P1/P2 (à jour): plan for P3, deretter P4, for å komme i forkant.
 *  - Fordeles på skoledager (mandag–fredag), maks 2 oppgaver per dag,
 *    så mange uker som trengs for å få med alle.
 *  - Start: i dag hvis det er en hverdag, ellers førstkommende mandag.
 * Humør: P1 uløst = rød sur munn, bare P2 = lyserød strek, bare P3 = lysegrønn smil, bare P4/ingen = mørkegrønn smil.
 */
import type { BellItem, Priority } from './bell';

export type Mood = 1 | 2 | 3 | 4;
export interface PlanDay { date: string; items: (BellItem & { afterDeadline: boolean })[] }
export interface CatchUpPlan { mode: 'ajour' | 'forkant' | 'ferdig'; mood: Mood; days: PlanDay[]; total: number; lateScheduled: number }

export const PER_DAY = 2;
const osloDay = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const addDay = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function moodOf(items: Pick<BellItem, 'priority'>[]): Mood {
  const ps = new Set(items.map((i) => i.priority));
  return ps.has(1) ? 1 : ps.has(2) ? 2 : ps.has(3) ? 3 : 4;
}

/** Første planleggingsdag: i dag (hverdag) eller neste mandag */
export function firstSchoolDay(now: number): string {
  let d = osloDay(now);
  while (dow(d) === 0 || dow(d) === 6) d = addDay(d, 1);
  return d;
}

export function catchUpPlan(items: BellItem[], now: number, perDay = PER_DAY): CatchUpPlan {
  const byDue = (a: BellItem, b: BellItem) => Date.parse(a.dueAt) - Date.parse(b.dueAt);
  const pick = (...ps: Priority[]) => ps.flatMap((p) => items.filter((i) => i.priority === p).sort(byDue));
  let queue = pick(1, 2);
  let mode: CatchUpPlan['mode'] = 'ajour';
  if (!queue.length) { queue = pick(3, 4); mode = queue.length ? 'forkant' : 'ferdig'; }

  const days: PlanDay[] = [];
  let day = firstSchoolDay(now);
  for (let i = 0; i < queue.length; i += perDay) {
    while (dow(day) === 0 || dow(day) === 6) day = addDay(day, 1);
    days.push({ date: day, items: queue.slice(i, i + perDay).map((it) => ({ ...it,
      // Utløpte er allerede for sene; for de andre: blir de gjort etter fristdagen?
      afterDeadline: !it.late && day > osloDay(Date.parse(it.dueAt)) })) });
    day = addDay(day, 1);
  }
  return { mode, mood: moodOf(items), days, total: queue.length, lateScheduled: days.flatMap((d) => d.items).filter((i) => i.afterDeadline).length };
}
