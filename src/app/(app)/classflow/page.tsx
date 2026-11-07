import Link from 'next/link';
import { PageHeader, StatCard, TypeBadge, EmptyState } from '@/components/ui';
import { loadAbsences, loadActivities, summarizeAbsence } from '@/lib/data';
import { fmtDateTime, relativeDays } from '@/lib/format';
import { getSession, requireRole } from '@/lib/session';
import { loadSubjects } from '@/lib/subjects';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'ClassFlow' };

/** ClassFlow: lærerens startside etter innlogging */
export default async function ClassFlowPage() {
  const s = await getSession();
  requireRole(s, 'teacher', 'admin');
  const supabase = await createClient();
  const [acts, { subjects, managed }, absences, { count: toGrade }] = await Promise.all([
    loadActivities(supabase, s), loadSubjects(supabase, s), loadAbsences(supabase, s),
    // RLS begrenser til innleveringer i fag læreren underviser
    supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'levert'),
  ]);
  const now = Date.now();
  const mine = subjects.filter((x) => managed.includes(x.id));
  const upcoming = acts.filter((a) => a.subjectId && managed.includes(a.subjectId) && Date.parse(a.date) >= now && Date.parse(a.date) < now + 30 * 86_400_000);
  const week = absences.filter((a) => Date.parse(a.date) > now - 7 * 86_400_000);
  const first = s.fullName.split(' ')[0];

  return (
    <>
      <PageHeader title="ClassFlow" description={`Hei ${first}. Her er klassene og fagene dine.`}
        actions={<><Link href="/oppgaver" className="btn-primary">Ny oppgave eller prøve</Link><Link href="/fravaer" className="btn-outline">Registrer fravær</Link></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Mine fag" value={mine.length} hint={[...new Set(mine.map((m) => m.className).filter(Boolean))].join(', ')} />
        <StatCard label="Frister neste 30 dager" value={upcoming.length} />
        <StatCard label="Prøver neste 30 dager" value={upcoming.filter((a) => a.kind === 'test').length} tone="warn" />
        <StatCard label="Venter vurdering" value={toGrade ?? 0} tone={toGrade ? 'warn' : 'good'} hint="Levert, ikke vurdert" />
        <StatCard label="Fravær siste 7 dager" value={`${summarizeAbsence(week).total} t`} hint={`${week.length} registreringer`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b border-line px-5 py-3.5 font-medium">Kommende i fagene dine</h2>
          {upcoming.length === 0 ? <EmptyState title="Ingen frister de neste 30 dagene" /> : (
            <ul className="divide-y divide-line">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link href={`/arshjul?aktivitet=${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink/[.03]">
                    <span className="w-24 shrink-0 text-xs text-muted">{relativeDays(a.date)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="text-xs text-muted">{a.subjectName} · {fmtDateTime(a.date)}</span></span>
                    <TypeBadge type={a.activityType} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-medium">Snarveier</h2>
          <div className="grid gap-2">
            {[['/innleveringer', 'Vurder innleveringer'], ['/prover', 'Prøver og eksamen'], ['/fravaer', 'Fraværsoversikt'], ['/oppgaver', 'Alle oppgaver'], ['/fag', 'Fag']].map(([h, l]) => (
              <Link key={h} href={h} className="btn-outline justify-start">{l}</Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
