import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui';
import { loadAbsences, loadActivities } from '@/lib/data';
import { fmtDateShort } from '@/lib/format';
import { COLOR_GROUP_OF, GROUP_META } from '@/lib/meta';
import { getSession } from '@/lib/session';
import { loadSubjects } from '@/lib/subjects';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Fag' };

export default async function FagPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ subjects }, activities, absences] = await Promise.all([loadSubjects(supabase, s), loadActivities(supabase, s), loadAbsences(supabase, s)]);
  const now = new Date();
  const staff = s.role === 'teacher' || s.role === 'admin';

  return (
    <>
      <PageHeader title="Fag" description={staff ? 'Fag og klasser du har tilgang til.' : 'Fagene dine dette skoleåret.'} />
      {subjects.length === 0 ? <div className="card"><EmptyState icon={<BookOpen />} title="Ingen fag" /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((sub) => {
            const acts = activities.filter((a) => a.subjectId === sub.id);
            const upcoming = acts.filter((a) => new Date(a.date) >= now);
            const next = upcoming[0];
            const absHours = absences.filter((a) => a.subject_id === sub.id).reduce((n, a) => n + Number(a.hours), 0);
            const done = acts.filter((a) => a.kind === 'assignment' && (a.status === 'levert' || a.status === 'fullfort')).length;
            const total = acts.filter((a) => a.kind === 'assignment' && new Date(a.date) < now).length;
            return (
              <div key={sub.id} className="card flex flex-col p-5 transition hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{sub.name}</div>
                    <div className="text-xs text-muted">{sub.code}{staff && sub.className ? ` · ${sub.className}` : ''} · {sub.teacherName ?? 'Ingen lærer'}</div>
                  </div>
                  <div className="flex -space-x-1">
                    {[...new Set(upcoming.map((a) => COLOR_GROUP_OF[a.activityType]))].map((g) =>
                      <span key={g} className="h-2.5 w-2.5 rounded-full ring-2 ring-[rgb(var(--panel))]" style={{ background: GROUP_META[g].hex }} />)}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-ink/[.04] p-2"><dt className="text-[11px] text-muted">Kommende</dt><dd className="font-semibold tabular-nums">{upcoming.length}</dd></div>
                  <div className="rounded-lg bg-ink/[.04] p-2"><dt className="text-[11px] text-muted">Prøver</dt><dd className="font-semibold tabular-nums">{upcoming.filter((a) => a.kind === 'test').length}</dd></div>
                  <div className="rounded-lg bg-ink/[.04] p-2"><dt className="text-[11px] text-muted">Fravær</dt><dd className="font-semibold tabular-nums">{absHours} t</dd></div>
                </dl>
                {!staff && total > 0 && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted"><span>Levert hittil</span><span>{done}/{total}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-accent" style={{ width: `${(done / total) * 100}%` }} /></div>
                  </div>
                )}
                <div className="mt-auto pt-4 text-sm">
                  {next ? <Link href={`/arshjul?aktivitet=${next.id}`} className="block truncate text-muted hover:text-ink">Neste: <span className="font-medium text-ink">{next.title}</span> · {fmtDateShort(next.date)}</Link>
                    : <span className="text-muted">Ingen kommende aktiviteter</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
