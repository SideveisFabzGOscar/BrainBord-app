import { ActivityTable } from '@/components/activity-table';
import { PageHeader, StatCard } from '@/components/ui';
import { loadActivities } from '@/lib/data';
import { getSession } from '@/lib/session';
import { loadSubjects } from '@/lib/subjects';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Prøver' };

export default async function ProverPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [activities, { subjects, managed }] = await Promise.all([loadActivities(supabase, s), loadSubjects(supabase, s)]);
  const tests = activities.filter((a) => a.kind === 'test');
  const now = new Date();
  const upcoming = tests.filter((t) => new Date(t.date) >= now);
  const results = tests.filter((t) => t.grade && /^\d$/.test(t.grade)).map((t) => Number(t.grade));
  const avg = results.length ? (results.reduce((a, b) => a + b, 0) / results.length).toFixed(1) : '–';
  const staff = s.role === 'teacher' || s.role === 'admin';
  return (
    <>
      <PageHeader title="Prøver og eksamen" description="Planlagte prøver, heldagsprøver og eksamener." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Kommende prøver" value={upcoming.filter((t) => t.activityType === 'prove').length} />
        <StatCard label="Kommende eksamener" value={upcoming.filter((t) => t.activityType === 'eksamen').length} />
        <StatCard label="Neste 14 dager" value={upcoming.filter((t) => new Date(t.date).getTime() - now.getTime() < 14 * 86_400_000).length} tone="warn" />
        <StatCard label={staff ? 'Prøver totalt' : 'Snitt resultat'} value={staff ? tests.length : avg} />
      </div>
      <ActivityTable items={tests} role={s.role} managed={managed} types={['prove', 'eksamen']}
        subjects={subjects.map((x) => ({ id: x.id, name: x.name, code: x.code, className: staff ? x.className : null }))}
        createLabel={staff ? 'Ny prøve' : 'Ny personlig aktivitet'} />
    </>
  );
}
