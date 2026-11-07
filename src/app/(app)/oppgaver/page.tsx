import { ActivityTable } from '@/components/activity-table';
import { PageHeader } from '@/components/ui';
import { loadActivities } from '@/lib/data';
import { getSession } from '@/lib/session';
import { loadSubjects } from '@/lib/subjects';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Oppgaver' };

export default async function OppgaverPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [activities, { subjects, managed }] = await Promise.all([loadActivities(supabase, s), loadSubjects(supabase, s)]);
  const staff = s.role === 'teacher' || s.role === 'admin';
  return (
    <>
      <PageHeader title="Oppgaver" description="Innleveringer, lekser, prosjekter, presentasjoner og frister fra alle plattformer." />
      <ActivityTable items={activities.filter((a) => a.kind === 'assignment')} role={s.role} managed={managed}
        subjects={subjects.map((x) => ({ id: x.id, name: x.name, code: x.code, className: staff ? x.className : null }))}
        types={['innlevering', 'oppgave', 'lekse', 'prosjekt', 'presentasjon', 'frist', 'annet']}
        createLabel="Ny oppgave" />
    </>
  );
}
