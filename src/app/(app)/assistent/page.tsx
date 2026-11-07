import { AssistantChat } from '@/components/assistant-chat';
import { ExampleDataBanner } from '@/components/source-badge';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Assistent' };

export default async function AssistentPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ data: conns }, { data: school }] = await Promise.all([
    supabase.from('user_connections').select('platform, status').eq('profile_id', s.userId),
    s.schoolId ? supabase.from('schools').select('is_demo').eq('id', s.schoolId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <PageHeader title="Skoleassistent" description="Får oversikt, prioriteringer og ukeplan ut fra dine egne frister. Finner aldri på oppgaver, frister eller karakterer." />
      {(school as { is_demo?: boolean } | null)?.is_demo && <ExampleDataBanner />}
      <AssistantChat connected={(conns ?? []).filter((c) => c.status === 'tilkoblet').map((c) => c.platform)} />
    </>
  );
}
