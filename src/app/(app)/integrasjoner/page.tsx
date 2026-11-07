import { ConnectionsPanel, type ConnectionCard } from '@/components/connections-panel';
import { IntegrationsPanel, type IntegrationView, type RunView } from '@/components/integrations-panel';
import { PageHeader } from '@/components/ui';
import { PROVIDERS } from '@/connections/service';
import { ERROR_TEXT } from '@/connections/types';
import { getConnector } from '@/integrations/registry';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Integrasjoner' };

export default async function IntegrasjonerPage({ searchParams }: { searchParams: Promise<{ tjeneste?: string; tilkoblet?: string; feil?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  const env = process.env as Record<string, string | undefined>;

  // ---------- Mine tilkoblinger (alle brukere, egne kontoer) ----------
  const [{ data: conns }, { data: counts }] = await Promise.all([
    supabase.from('user_connections').select('platform, status, account_label, last_synced_at, last_error, scopes').eq('profile_id', s.userId),
    supabase.from('external_items').select('platform').eq('profile_id', s.userId),
  ]);
  const cards: ConnectionCard[] = (['iskole', 'canvas', 'teams'] as const).map((p) => {
    const mod = PROVIDERS[p];
    const row = conns?.find((c) => c.platform === p);
    const cfg = mod.configured(env);
    return {
      platform: p, label: mod.label, status: (cfg.ok ? row?.status : undefined) ?? 'ikke_tilkoblet',
      accountLabel: row?.account_label ?? null, lastSyncedAt: row?.last_synced_at ?? null, lastError: row?.last_error ?? null,
      itemCount: counts?.filter((c) => c.platform === p).length ?? 0, provides: mod.provides, limitations: mod.limitations,
      configured: cfg.ok, missing: cfg.missing, notConfiguredReason: cfg.ok ? null : ERROR_TEXT[cfg.reason ?? 'NOT_CONFIGURED'],
      docsUrl: mod.docsUrl, scopes: row?.scopes ?? [],
    };
  });

  // ---------- Skolens integrasjoner (kun ansatte) ----------
  const staff = s.role === 'admin' || s.role === 'teacher';
  let items: IntegrationView[] = [], runViews: RunView[] = [];
  if (staff) {
    const [{ data: rows }, { data: runs }] = await Promise.all([
      supabase.from('integrations').select('*').order('created_at'),
      supabase.from('sync_runs').select('id, status, started_at, created_count, updated_count, skipped_count, error_count, log, integrations(platform)')
        .order('started_at', { ascending: false }).limit(20),
    ]);
    // Status beregnes på serveren. Bare "finnes/finnes ikke" sendes til klienten – aldri verdier.
    items = (rows ?? []).map((r) => {
      const c = getConnector(r.platform);
      const st = c?.status({ env, config: r.config ?? {} }) ?? { configured: false, missing: [], accessNote: '' };
      return {
        id: r.id, platform: r.platform, displayName: r.display_name, status: r.status, lastSyncedAt: r.last_synced_at,
        lastError: r.last_error, config: r.config ?? {}, configured: st.configured, missing: st.missing, accessNote: st.accessNote,
        docsUrl: c?.docsUrl, authType: c?.authType ?? 'none',
      };
    });
    runViews = (runs ?? []).map((r) => ({
      id: r.id, platform: (r.integrations as unknown as { platform: string } | null)?.platform ?? '?', status: r.status,
      startedAt: r.started_at, created: r.created_count, updated: r.updated_count, skipped: r.skipped_count, errors: r.error_count,
      log: (r.log as RunView['log']) ?? [],
    }));
  }

  return (
    <>
      <PageHeader title="Integrasjoner"
        description="Koble til dine egne kontoer, så samles alt i Brainbord. Innlogging skjer alltid hos tjenesten selv, og bare med offisielle API-er." />
      <h2 className="mb-3 font-medium">Mine tilkoblinger</h2>
      <ConnectionsPanel cards={cards} flash={{ platform: sp.tjeneste, ok: sp.tilkoblet === '1',
        // Vis bare kjente meldinger, så en lenke ikke kan plante vilkårlig tekst i siden
        error: sp.feil ? ((Object.values(ERROR_TEXT) as string[]).includes(sp.feil) ? sp.feil : 'Tilkoblingen feilet. Prøv igjen.') : undefined }} />
      {staff && (
        <>
          <h2 className="mb-1 mt-10 font-medium">Skolens integrasjoner</h2>
          <p className="mb-4 text-sm text-muted">Synkronisering for hele skolen (administrator). Påvirker ikke elevenes egne tilkoblinger.</p>
          <IntegrationsPanel items={items} runs={runViews} isAdmin={s.role === 'admin'} />
        </>
      )}
    </>
  );
}
