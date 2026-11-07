import { NextResponse } from 'next/server';
import { getConnector } from '@/integrations/registry';
import { runSync } from '@/integrations/sync-engine';
import { SupabaseSyncStore } from '@/integrations/supabase-store';
import { createLogger } from '@/integrations/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Starter synkronisering for én plattform. Kun skoleadministrator. */
export async function POST(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const connector = getConnector(platform);
  if (!connector || platform === 'csv') return NextResponse.json({ error: 'Ukjent eller filbasert plattform' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single();
  if (profile?.role !== 'admin' || !profile.school_id) return NextResponse.json({ error: 'Kun administrator' }, { status: 403 });

  // RLS sørger for at admin bare finner integrasjoner på egen skole
  const { data: integration } = await supabase.from('integrations')
    .select('id, config, status').eq('platform', platform).eq('school_id', profile.school_id).single();
  if (!integration) return NextResponse.json({ error: 'Integrasjonen finnes ikke for skolen' }, { status: 404 });
  if (integration.status === 'deaktivert') return NextResponse.json({ error: 'Integrasjonen er deaktivert' }, { status: 409 });

  const summary = await runSync({
    connector,
    store: new SupabaseSyncStore(createAdminClient()),
    integrationId: integration.id,
    triggeredBy: user.id,
    ctx: {
      schoolId: profile.school_id,
      config: integration.config ?? {},
      env: process.env as Record<string, string | undefined>,
      fetch,
      logger: createLogger(),
    },
  });
  return NextResponse.json(summary, { status: summary.status === 'feilet' ? 422 : 200 });
}
