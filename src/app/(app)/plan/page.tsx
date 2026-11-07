import { MOOD, MoodFace } from '@/components/mood-face';
import { PlanBoard, type SolvedItem } from '@/components/plan-board';
import { EmptyState, PageHeader } from '@/components/ui';
import { bellItems } from '@/lib/bell';
import { catchUpPlan, PER_DAY } from '@/lib/catchup';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadUnified } from '@/lib/unified-data';

export const metadata = { title: 'Gjennomføringsplan' };


export default async function PlanPage() {
  const s = await getSession();
  if (!s.studentId) {
    return (<><PageHeader title="Gjennomføringsplan" /><div className="card"><EmptyState title="Planen lages for elever" text="Logg inn som elev, eller som foresatt med et barn valgt." /></div></>);
  }
  const now = Date.now();
  const data = await loadUnified(await createClient(), s);
  const { items } = bellItems(data.tasks, now);
  const solved: SolvedItem[] = data.tasks.filter((t) => t.solvedAt).sort((a, b) => b.solvedAt!.localeCompare(a.solvedAt!)).map((t) => ({
    key: t.key, refs: t.sources.map((x) => ({ source: x.source, id: x.id })), title: t.title, courseName: t.courseName, dueAt: t.dueAt,
    solvedAt: t.solvedAt!, sources: t.sources.map((x) => x.source), open: t.open ?? null }));
  const plan = catchUpPlan(items, now);
  const intro = plan.mode === 'ajour'
    ? `Du har ${plan.total} oppgaver med prioritet P1 og P2. Planen tar utløpte (P1) først, deretter de som forfaller innen 7 dager (P2), med maks ${PER_DAY} oppgaver per skoledag.`
    : plan.mode === 'forkant'
      ? `Du er à jour. Planen bruker P3- og P4-oppgaver, så du kommer i forkant, med maks ${PER_DAY} oppgaver per skoledag.`
      : 'Du har ingen åpne oppgaver de neste 30 dagene.';

  return (
    <>
      <PageHeader title="Gjennomføringsplan" description="Plan for å komme à jour: mandag–fredag, maks to oppgaver per dag. Huk av «Løst» når du er ferdig." />
      <div className="card mb-6 flex flex-wrap items-center gap-4 p-5">
        <MoodFace mood={plan.mood} size={56} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{MOOD[plan.mood].label}</div>
          <p className="mt-1 text-sm text-muted">{intro}</p>
          {plan.days.length > 0 && <p className="mt-1 text-sm text-muted">Ferdig {new Date(`${plan.days.at(-1)!.date}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })} hvis du følger planen.</p>}
        </div>
      </div>
      <PlanBoard plan={plan} solved={solved} />
    </>
  );
}
