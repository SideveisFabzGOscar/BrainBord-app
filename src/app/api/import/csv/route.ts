import { NextResponse } from 'next/server';
import { csvConnector } from '@/integrations/connectors/csv';
import { runSync } from '@/integrations/sync-engine';
import { SupabaseSyncStore } from '@/integrations/supabase-store';
import { createLogger } from '@/integrations/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** CSV-import av aktiviteter eller fravær. Kun skoleadministrator. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single();
  if (profile?.role !== 'admin' || !profile.school_id) return NextResponse.json({ error: 'Kun administrator' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('file');
  const importType = form.get('importType') === 'fravaer' ? 'fravaer' : 'aktiviteter';
  if (!(file instanceof File)) return NextResponse.json({ error: 'Mangler fil' }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: 'Maks 5 MB' }, { status: 413 });

  const { data: integration } = await supabase.from('integrations')
    .select('id').eq('platform', 'csv').eq('school_id', profile.school_id).single();
  if (!integration) return NextResponse.json({ error: 'CSV-integrasjon er ikke aktivert for skolen' }, { status: 404 });

  const summary = await runSync({
    connector: csvConnector,
    store: new SupabaseSyncStore(createAdminClient()),
    integrationId: integration.id,
    triggeredBy: user.id,
    ctx: {
      schoolId: profile.school_id, config: {}, env: {}, fetch, logger: createLogger(),
      file: { name: file.name, content: await file.text(), importType },
    },
  });
  return NextResponse.json(summary, { status: summary.status === 'feilet' ? 422 : 200 });
}
