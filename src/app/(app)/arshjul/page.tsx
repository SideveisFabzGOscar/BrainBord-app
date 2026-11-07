import { PageHeader } from '@/components/ui';
import { YearWheel } from '@/components/year-wheel';
import { loadActivities } from '@/lib/data';
import { getSession } from '@/lib/session';
import { currentSchoolYear, loadSubjects } from '@/lib/subjects';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Årshjul' };

export default async function ArshjulPage({ searchParams }: { searchParams: Promise<{ aktivitet?: string }> }) {
  const { aktivitet } = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const [activities, { subjects, managed }, year] = await Promise.all([
    loadActivities(supabase, s), loadSubjects(supabase, s), currentSchoolYear(supabase),
  ]);
  return (
    <>
      <PageHeader title="Årshjul" description="Alle innleveringer, prøver, prosjekter og frister gjennom skoleåret. Oppdateres automatisk ved import." />
      <YearWheel activities={activities} subjects={subjects.map((x) => ({ id: x.id, name: x.name, code: x.code, className: s.role === 'teacher' || s.role === 'admin' ? x.className : null }))}
        role={s.role} yearStart={year.start} yearEnd={year.end} yearLabel={year.label} initialActivityId={aktivitet ?? null} managedSubjectIds={managed} />
    </>
  );
}
