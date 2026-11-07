import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardCheck, FileCheck2, RefreshCw, UserX } from 'lucide-react';
import { AbsenceDonut, WorkloadChart } from '@/components/charts';
import { EmptyState, PageHeader, StatCard, StatusBadge, TypeBadge } from '@/components/ui';
import { loadAbsences, loadActivities, summarizeAbsence } from '@/lib/data';
import { addDays, fmtDateTime, isoWeek, relativeDays, startOfWeek } from '@/lib/format';
import { COLOR_GROUP_OF, PLATFORM_LABEL, type ColorGroup } from '@/lib/meta';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [activities, absences] = await Promise.all([loadActivities(supabase, s), loadAbsences(supabase, s)]);
  const now = new Date();
  const weekStart = startOfWeek(now), weekEnd = addDays(weekStart, 7);
  const future = activities.filter((a) => new Date(a.date) >= now);
  const done = (st: string) => st === 'levert' || st === 'fullfort';

  const upcomingTests = future.filter((a) => a.kind === 'test').length;
  const upcomingSubmissions = future.filter((a) => a.activityType === 'innlevering').length;
  const notDelivered = s.studentId
    ? activities.filter((a) => a.kind === 'assignment' && !a.personal && new Date(a.date) < now && !done(a.status)
        && ['innlevering', 'oppgave', 'prosjekt'].includes(a.activityType)).length
    : null;
  const thisWeek = activities.filter((a) => { const d = new Date(a.date); return d >= weekStart && d < weekEnd; });
  const abs = summarizeAbsence(absences);

  // Arbeidsmengde de neste 8 ukene
  const workload = Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(weekStart, i * 7), we = addDays(ws, 7);
    const row: { week: string } & Partial<Record<ColorGroup, number>> = { week: `Uke ${isoWeek(ws)}` };
    for (const a of activities) {
      const d = new Date(a.date);
      if (d >= ws && d < we) { const g = COLOR_GROUP_OF[a.activityType]; row[g] = (row[g] ?? 0) + 1; }
    }
    return row;
  });

  const { data: recent } = await supabase.from('assignments')
    .select('id, title, source_platform, updated_at, subjects(name)')
    .neq('source_platform', 'manual').order('updated_at', { ascending: false }).limit(6);
  const { data: runs } = s.role === 'admin' || s.role === 'teacher'
    ? await supabase.from('sync_runs').select('id, status, started_at, created_count, updated_count, integrations(display_name)')
        .order('started_at', { ascending: false }).limit(4)
    : { data: null };

  const who = s.role === 'parent' ? s.studentName : s.fullName.split(' ')[0];
  return (
    <>
      <PageHeader
        title={s.role === 'parent' ? `Oversikt for ${who ?? 'barnet ditt'}` : `Hei, ${who} 👋`}
        description={`Uke ${isoWeek(now)} · ${thisWeek.length} aktiviteter denne uken`}
        actions={<Link href="/arshjul" className="btn-outline">Åpne årshjul <ArrowRight size={15} /></Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Kommende prøver" value={upcomingTests} icon={<ClipboardCheck size={15} />} />
        <StatCard label="Kommende innleveringer" value={upcomingSubmissions} icon={<FileCheck2 size={15} />} />
        <StatCard label="Ikke levert" value={notDelivered ?? '–'} tone={notDelivered ? 'bad' : 'default'}
          hint={notDelivered === null ? 'Vises for elev/foresatt' : 'Fristen er passert'} icon={<AlertTriangle size={15} />} />
        <StatCard label="Frister denne uken" value={thisWeek.length} icon={<CalendarClock size={15} />} />
        <StatCard label="Totalt fravær" value={`${abs.total} t`} icon={<UserX size={15} />} />
        <StatCard label="Udokumentert fravær" value={`${abs.undocumented} t`} tone={abs.undocumented > 0 ? 'warn' : 'good'}
          hint={`${abs.documented} t dokumentert`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-1 font-medium">Arbeidsmengde neste 8 uker</h2>
          <p className="mb-4 text-xs text-muted">Antall aktiviteter per uke, fordelt på type</p>
          <WorkloadChart data={workload} />
        </section>
        <section className="card p-5">
          <h2 className="mb-1 font-medium">Fravær</h2>
          <p className="mb-2 text-xs text-muted">Dokumentert og udokumentert</p>
          <AbsenceDonut documented={abs.documented} undocumented={abs.undocumented} />
          <Link href="/fravaer" className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline">Se detaljer <ArrowRight size={14} /></Link>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="border-b border-line px-5 py-3.5 font-medium">Kommende aktiviteter</h2>
          {future.length === 0 ? <EmptyState title="Ingen kommende aktiviteter" /> : (
            <ul className="divide-y divide-line">
              {future.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <Link href={`/arshjul?aktivitet=${a.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink/[.03]">
                    <div className="w-20 shrink-0 text-xs text-muted">{relativeDays(a.date)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-muted">{a.subjectName ?? 'Personlig'} · {fmtDateTime(a.date)}</div>
                    </div>
                    <TypeBadge type={a.activityType} />
                    {s.studentId && <span className="hidden sm:inline"><StatusBadge status={a.status} /></span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 font-medium"><RefreshCw size={15} /> Siste oppdateringer</h2>
          <ul className="divide-y divide-line text-sm">
            {runs?.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <div className="font-medium">{(r.integrations as unknown as { display_name: string })?.display_name}: {r.status}</div>
                <div className="text-xs text-muted">{fmtDateTime(r.started_at)} · {r.created_count} nye, {r.updated_count} oppdatert</div>
              </li>
            ))}
            {(recent ?? []).map((r) => (
              <li key={r.id} className="px-5 py-3">
                <div className="truncate font-medium">{r.title}</div>
                <div className="text-xs text-muted">
                  {PLATFORM_LABEL[r.source_platform]} · {(r.subjects as unknown as { name: string } | null)?.name} · {fmtDateTime(r.updated_at)}
                </div>
              </li>
            ))}
            {!runs?.length && !recent?.length && <li><EmptyState title="Ingen importerte data ennå" /></li>}
          </ul>
        </section>
      </div>
    </>
  );
}
