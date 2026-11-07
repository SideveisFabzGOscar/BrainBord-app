/**
 * Deterministisk prioritering og ukeplan. Brukes direkte av assistenten,
 * og som fasit når en språkmodell formulerer svaret. Funksjonene bruker
 * KUN oppgavene de får inn – de kan ikke finne på noe.
 */
import { osloDay, urgency, type UnifiedTask } from './unified';

/** Antatt arbeidsmengde i timer. Dette er et anslag, og vises som det. */
export const EFFORT_HOURS: Record<string, number> = {
  eksamen: 8, prove: 4, prosjekt: 6, innlevering: 3, presentasjon: 3, oppgave: 1.5, lekse: 1, frist: 0.5, annet: 1,
};
export const effortOf = (t: UnifiedTask) => EFFORT_HOURS[t.activityType ?? (t.kind === 'prove' ? 'prove' : 'innlevering')] ?? 2;

export interface Priority { task: UnifiedTask; score: number; reason: string }

export function prioritize(tasks: UnifiedTask[], now: number): Priority[] {
  const open = tasks.filter((t) => t.status !== 'levert' && t.status !== 'vurdert' && t.dueAt);
  return open.map((t) => {
    const hours = (Date.parse(t.dueAt!) - now) / 3_600_000;
    const effort = effortOf(t);
    const u = urgency(t, now);
    let score: number, reason: string;
    if (u === 'forfalt') {
      score = 1000 - Math.min(hours * -1, 500);
      reason = 'Fristen har gått ut. Sjekk med læreren om du fortsatt kan levere.';
    } else {
      // Mye arbeid kort tid før frist = høy prioritet
      score = Math.round((effort / Math.max(hours / 24, 0.25)) * 100) / 10 + (t.kind === 'prove' ? 5 : 0);
      reason = hours < 24 ? 'Frist innen et døgn.' : hours < 72 ? `Frist om ${Math.ceil(hours / 24)} dager.`
        : `Frist om ${Math.ceil(hours / 24)} dager, anslått ${effort} t arbeid.`;
      if (t.kind === 'prove') reason += ' Prøve/eksamen: start forberedelsene tidlig.';
    }
    return { task: t, score, reason };
  }).sort((a, b) => b.score - a.score);
}

export interface StudyBlock { day: string; start: string; end: string; taskKey: string; title: string; courseName: string | null; dueAt: string }
export interface WeekPlan { days: { day: string; blocks: StudyBlock[]; deadlines: UnifiedTask[] }[]; unplanned: { title: string; missingHours: number }[]; assumptions: string[] }

/**
 * Legger studieøkter på ettermiddagene (16:00–20:00, maks 2 t per dag på hverdager, 3 t i helgen),
 * før fristen, med de mest presserende oppgavene først. Skoletiden antas å være 08:15–15:30
 * fordi timeplanen ikke er tilgjengelig via noe offisielt API.
 */
export function weekPlan(tasks: UnifiedTask[], now: number, days = 7): WeekPlan {
  const start = new Date(now);
  const plan: WeekPlan['days'] = [];
  const capacity: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const day = osloDay(d.toISOString());
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    plan.push({ day, blocks: [], deadlines: tasks.filter((t) => t.dueAt && osloDay(t.dueAt) === day) });
    capacity.push(dow === 0 || dow === 6 ? 3 : 2);
  }
  const used = new Array(days).fill(0);
  const unplanned: WeekPlan['unplanned'] = [];
  for (const { task } of prioritize(tasks, now)) {
    if (Date.parse(task.dueAt!) < now) continue; // forfalte håndteres i prioriteringen
    let remaining = effortOf(task);
    const dueDay = osloDay(task.dueAt!);
    for (let i = 0; i < days && remaining > 0; i++) {
      // Arbeid må gjøres FØR fristdagen (eller samme dag hvis fristen er sent på kvelden)
      const dueHour = Number(new Date(task.dueAt!).toLocaleString('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hour12: false }));
      const lastOk = plan[i].day < dueDay || (plan[i].day === dueDay && dueHour >= 20);
      if (!lastOk) break;
      const free = capacity[i] - used[i];
      if (free <= 0) continue;
      const h = Math.min(free, remaining, 1.5);
      const startH = 16 + used[i];
      plan[i].blocks.push({ day: plan[i].day, start: hhmm(startH), end: hhmm(startH + h), taskKey: task.key, title: task.title,
        courseName: task.courseName, dueAt: task.dueAt! });
      used[i] += h; remaining -= h;
    }
    if (remaining > 0 && osloDay(task.dueAt!) <= plan[days - 1].day) unplanned.push({ title: task.title, missingHours: remaining });
  }
  return {
    days: plan, unplanned,
    assumptions: [
      'Timeplanen er ikke tilgjengelig, så skoletid antas 08:15–15:30 på hverdager.',
      'Arbeidsmengde er anslått ut fra oppgavetype (f.eks. innlevering 3 t, prøve 4 t). Juster etter egen erfaring.',
      'Studieøkter legges 16:00–18:00 på hverdager og 16:00–19:00 i helgen.',
    ],
  };
}
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
