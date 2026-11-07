import { Info } from 'lucide-react';
import { RegisterAbsence } from '@/components/absence-form';
import { HorizontalBars, MonthlyAbsence } from '@/components/charts';
import { Badge, EmptyState, PageHeader, StatCard } from '@/components/ui';
import { loadAbsences, summarizeAbsence } from '@/lib/data';
import { fmtDate, MONTHS } from '@/lib/format';
import { ABSENCE_LABEL, DOC_STATUS_META } from '@/lib/meta';
import { getSession } from '@/lib/session';
import { loadSubjects } from '@/lib/subjects';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Fravær' };

export default async function FravaerPage() {
  const s = await getSession();
  const supabase = await createClient();
  const rows = await loadAbsences(supabase, s);
  const sum = summarizeAbsence(rows);
  const staff = s.role === 'teacher' || s.role === 'admin';

  let studentOptions: { id: string; full_name: string; className: string | null }[] = [];
  let subjectOptions: { id: string; name: string; className: string | null }[] = [];
  if (staff) {
    const [{ data: st }, { subjects, managed }] = await Promise.all([
      supabase.from('students').select('id, full_name, classes(name)').order('full_name'),
      loadSubjects(supabase, s),
    ]);
    studentOptions = (st ?? []).map((x) => ({ id: x.id, full_name: x.full_name, className: (x.classes as unknown as { name: string } | null)?.name ?? null }));
    subjectOptions = subjects.filter((x) => managed.includes(x.id)).map((x) => ({ id: x.id, name: x.name, className: x.className }));
  }

  return (
    <>
      <PageHeader title="Fravær" description={staff ? 'Fravær for elever du har tilgang til.' : 'Oversikt over fraværet ditt gjennom skoleåret.'}
        actions={staff ? <RegisterAbsence students={studentOptions} subjects={subjectOptions} /> : undefined} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Totalt fravær" value={`${sum.total} t`} hint={`${rows.length} registreringer`} />
        <StatCard label="Dokumentert" value={`${sum.documented} t`} tone="good" />
        <StatCard label="Udokumentert" value={`${sum.undocumented} t`} tone={sum.undocumented ? 'warn' : 'good'} />
        <StatCard label="Venter behandling" value={rows.filter((r) => r.documentation_status === 'venter').length} />
      </div>

      {!staff && sum.undocumented > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span>Du har udokumentert fravær. Last opp egenmelding eller legeerklæring under <a className="font-medium underline" href="/dokumentasjon">Dokumentasjon</a>.
            Sjekk skolens regler for fraværsgrense i fagene dine.</span>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-medium">Fravær per måned</h2>
          {sum.byMonth.length ? <MonthlyAbsence data={sum.byMonth.map((m) => ({ ...m, month: MONTHS[Number(m.month.slice(5)) - 1] }))} />
            : <EmptyState title="Ingen fravær registrert" />}
        </section>
        <section className="card p-5">
          <h2 className="mb-4 font-medium">Fravær per fag</h2>
          {sum.bySubject.length ? <HorizontalBars data={sum.bySubject} /> : <EmptyState title="Ingen fravær registrert" />}
        </section>
      </div>

      <section className="card mt-6 overflow-x-auto">
        <h2 className="border-b border-line px-5 py-3.5 font-medium">Historikk</h2>
        {rows.length === 0 ? <EmptyState title="Ingen fravær" /> : (
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line"><tr>
              <th className="table-th">Dato</th>{staff && <th className="table-th">Elev</th>}<th className="table-th">Tid</th>
              <th className="table-th">Fag</th><th className="table-th">Type</th><th className="table-th">Timer</th><th className="table-th">Dokumentasjon</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 300).map((r) => (
                <tr key={r.id}>
                  <td className="table-td whitespace-nowrap">{fmtDate(r.date)}</td>
                  {staff && <td className="table-td font-medium">{r.students?.full_name}</td>}
                  <td className="table-td whitespace-nowrap text-muted">{r.from_time?.slice(0, 5)}–{r.to_time?.slice(0, 5)}</td>
                  <td className="table-td">{r.subjects?.name ?? '–'}</td>
                  <td className="table-td">{ABSENCE_LABEL[r.absence_type]}</td>
                  <td className="table-td tabular-nums">{Number(r.hours)}</td>
                  <td className="table-td"><Badge className={DOC_STATUS_META[r.documentation_status].cls}>{DOC_STATUS_META[r.documentation_status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
