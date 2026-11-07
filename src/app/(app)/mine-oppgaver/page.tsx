import Link from 'next/link';
import { MyTasks } from '@/components/my-tasks';
import { ExampleDataBanner } from '@/components/source-badge';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadUnified } from '@/lib/unified-data';

export const metadata = { title: 'Mine oppgaver' };

export default async function MineOppgaverPage() {
  const s = await getSession();
  const data = await loadUnified(await createClient(), s);
  const connected = data.connections.filter((c) => c.status === 'tilkoblet').map((c) => c.platform);
  return (
    <>
      <PageHeader title="Mine oppgaver"
        description="Oppgaver fra Canvas, Teams og Brainbord i én liste, sortert etter frist. Like oppgaver i flere systemer vises én gang."
        actions={<Link href="/integrasjoner" className="btn-outline">Tilkoblinger</Link>} />
      {data.schoolIsDemo && <ExampleDataBanner />}
      {!connected.includes('canvas') && !connected.includes('teams') && (
        <p className="mb-4 rounded-xl border border-dashed border-line p-3 text-sm text-muted">
          Canvas og Teams er ikke koblet til ennå, så listen viser bare oppgaver som skolen har lagt inn i Brainbord.{' '}
          <Link href="/integrasjoner" className="text-accent hover:underline">Koble til</Link>
        </p>
      )}
      <MyTasks tasks={data.tasks} now={Date.now()} canEdit={s.role === 'student'} />
    </>
  );
}
