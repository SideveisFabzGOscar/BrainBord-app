import { IntegrationsPanel, type IntegrationView, type RunView } from '@/components/integrations-panel';
import { PageHeader } from '@/components/ui';
import { getConnector } from '@/integrations/registry';
import { getSession, requireRole } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Integrasjoner' };

export default async function IntegrasjonerPage() {
  const s = await getSession();
  requireRole(s, 'admin', 'teacher');
  const supabase = await createClient();
  const [{ data: rows }, { data: runs }] = await Promise.all([
    supabase.from('integrations').select('*').order('created_at'),
    supabase.from('sync_runs').select('id, status, started_at, created_count, updated_count, skipped_count, error_count, log, integrations(platform)')
      .order('started_at', { ascending: false }).limit(20),
  ]);

  // Status beregnes på serveren. Bare "finnes/finnes ikke" sendes til klienten – aldri verdier.
  const env = process.env as Record<string, string | undefined>;
  const items: IntegrationView[] = (rows ?? []).map((r) => {
    const c = getConnector(r.platform);
    const st = c?.status({ env, config: r.config ?? {} }) ?? { configured: false, missing: [], accessNote: '' };
    return {
      id: r.id, platform: r.platform, displayName: r.display_name, status: r.status, lastSyncedAt: r.last_synced_at,
      lastError: r.last_error, config: r.config ?? {}, configured: st.configured, missing: st.missing, accessNote: st.accessNote,
      docsUrl: c?.docsUrl, authType: c?.authType ?? 'none',
    };
  });
  const runViews: RunView[] = (runs ?? []).map((r) => ({
    id: r.id, platform: (r.integrations as unknown as { platform: string } | null)?.platform ?? '?', status: r.status,
    startedAt: r.started_at, created: r.created_count, updated: r.updated_count, skipped: r.skipped_count, errors: r.error_count,
    log: (r.log as RunView['log']) ?? [],
  }));

  return (
    <>
      <PageHeader title="Integrasjoner"
        description="Modulbasert kobling mot læringsplattformer via offisielle API-er. Ingen scraping. Status vises ærlig – ingenting lates å være tilkoblet." />
      <IntegrationsPanel items={items} runs={runViews} isAdmin={s.role === 'admin'} />
    </>
  );
}
