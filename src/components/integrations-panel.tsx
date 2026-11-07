'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, ChevronDown, FileSpreadsheet, FlaskConical, Loader2, PlugZap, RefreshCw, Settings2, Upload } from 'lucide-react';
import { saveIntegrationConfig } from '@/app/(app)/actions';
import { fmtDateTime } from '@/lib/format';
import { Badge, Modal, useToast } from './ui';

export interface IntegrationView {
  id: string; platform: string; displayName: string; status: string; lastSyncedAt: string | null; lastError: string | null;
  config: Record<string, unknown>; configured: boolean; missing: string[]; accessNote: string; docsUrl?: string; authType: string;
}
export interface RunView {
  id: string; platform: string; status: string; startedAt: string; created: number; updated: number; skipped: number; errors: number;
  log: { level?: string; message: string; at?: string }[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
  tilkoblet: { label: 'Tilkoblet', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  testmodus: { label: 'Testmodus', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  ikke_tilkoblet: { label: 'Ikke tilkoblet', cls: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300' },
  feil: { label: 'Feil', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  deaktivert: { label: 'Deaktivert', cls: 'bg-zinc-500/10 text-zinc-500' },
};
const RUN: Record<string, string> = { vellykket: 'text-emerald-600', delvis: 'text-amber-600', feilet: 'text-red-600', kjorer: 'text-muted' };

export function IntegrationsPanel({ items, runs, isAdmin }: { items: IntegrationView[]; runs: RunView[]; isAdmin: boolean }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [configFor, setConfigFor] = useState<IntegrationView | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function sync(platform: string) {
    setBusy(platform);
    try {
      const res = await fetch(`/api/integrations/${platform}/sync`, { method: 'POST' });
      const j = await res.json();
      toast(res.ok ? `Synkronisert: ${j.message}` : (j.message ?? j.error ?? 'Synkronisering feilet'), res.ok ? 'ok' : 'err');
    } catch { toast('Nettverksfeil', 'err'); }
    setBusy(null);
    router.refresh();
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy('csv');
    const res = await fetch('/api/import/csv', { method: 'POST', body: new FormData(e.currentTarget) });
    const j = await res.json().catch(() => ({}));
    toast(res.ok ? `Importert: ${j.message}` : (j.message ?? j.error ?? 'Import feilet'), res.ok ? 'ok' : 'err');
    setBusy(null);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  const apis = items.filter((i) => i.platform !== 'csv');
  const csv = items.find((i) => i.platform === 'csv');

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {apis.map((i) => {
          const st = STATUS[i.status] ?? STATUS.ikke_tilkoblet;
          const isMock = i.platform === 'mock';
          return (
            <div key={i.id} className={clsx('card flex flex-col p-5', isMock && 'border-dashed')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink/5">{isMock ? <FlaskConical size={18} /> : <PlugZap size={18} />}</div>
                  <div><div className="font-medium">{i.displayName}</div>
                    <div className="text-xs text-muted">{i.lastSyncedAt ? `Sist synkronisert ${fmtDateTime(i.lastSyncedAt)}` : 'Aldri synkronisert'}</div></div>
                </div>
                <Badge className={st.cls}>{st.label}</Badge>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{i.accessNote}</p>
              {!i.configured && i.missing.length > 0 && (
                <div className="mt-3 rounded-lg bg-ink/[.04] p-3 text-xs">
                  <div className="mb-1 font-medium">Mangler for ekte tilkobling:</div>
                  <ul className="list-inside list-disc space-y-0.5 text-muted">{i.missing.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
                </div>
              )}
              {i.lastError && i.status === 'feil' && <p className="mt-3 flex gap-1.5 text-xs text-red-600"><AlertCircle size={14} className="shrink-0" />{i.lastError}</p>}
              {isAdmin && (
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button className="btn-primary" disabled={!!busy || i.status === 'deaktivert'} onClick={() => sync(i.platform)}>
                    {busy === i.platform ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isMock ? 'Kjør testsynk' : i.configured ? 'Synkroniser nå' : 'Test tilkobling'}
                  </button>
                  {!isMock && <button className="btn-outline" onClick={() => setConfigFor(i)}><Settings2 size={15} /> Konfigurer</button>}
                  {i.docsUrl && <a className="btn-ghost text-xs" href={i.docsUrl} target="_blank" rel="noreferrer">API-dokumentasjon ↗</a>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {csv && (
        <section className="card mt-6 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink/5"><FileSpreadsheet size={18} /></div>
            <div><div className="font-medium">CSV-import</div>
              <div className="text-xs text-muted">For plattformer uten API-tilgang: eksporter fra plattformen og last opp her.</div></div>
          </div>
          {isAdmin ? (
            <form onSubmit={upload} className="mt-4 flex flex-wrap items-end gap-3">
              <div><label className="label" htmlFor="csv-type">Innhold</label>
                <select id="csv-type" name="importType" className="input w-auto">
                  <option value="aktiviteter">Oppgaver og prøver</option><option value="fravaer">Fravær</option>
                </select></div>
              <div className="min-w-[220px] flex-1"><label className="label" htmlFor="csv-file">Fil (.csv, maks 5 MB)</label>
                <input id="csv-file" name="file" type="file" accept=".csv,text/csv" required className="input file:mr-3 file:rounded file:border-0 file:bg-ink/5 file:px-2 file:py-1 file:text-sm" /></div>
              <button className="btn-primary" disabled={!!busy}>{busy === 'csv' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Importer</button>
            </form>
          ) : <p className="mt-3 text-sm text-muted">Kun skoleadministrator kan importere.</p>}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted">Kolonneformat</summary>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <pre className="overflow-x-auto rounded-lg bg-ink/[.04] p-3 text-xs">{`id;tittel;type;fag;frist;beskrivelse
A-101;Novelleanalyse;innlevering;NOR1260;24.11.2026 23:59;600-800 ord
A-102;Kapittelprøve 4;prøve;MAT1001;02.12.2026 08:30;`}</pre>
              <pre className="overflow-x-auto rounded-lg bg-ink/[.04] p-3 text-xs">{`elev_epost;dato;fra;til;type;fag;dokumentert
elev@skolehub.test;03.11.2026;08:15;10:15;sykdom;NOR1260;ja`}</pre>
            </div>
            <p className="mt-2 text-xs text-muted">Skilletegn ; , eller tab. Datoer dd.mm.åååå [tt:mm] eller åååå-mm-dd. Rader med samme id importeres ikke dobbelt.</p>
          </details>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="border-b border-line px-5 py-3.5 font-medium">Synkroniseringshistorikk</h2>
        {runs.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Ingen synkroniseringer ennå.</p> : (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <button className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-ink/[.03]" onClick={() => setOpenRun(openRun === r.id ? null : r.id)} aria-expanded={openRun === r.id}>
                  {r.status === 'vellykket' ? <CheckCircle2 size={16} className={RUN[r.status]} /> : <AlertCircle size={16} className={RUN[r.status]} />}
                  <span className="w-28 font-medium">{items.find((i) => i.platform === r.platform)?.displayName ?? r.platform}</span>
                  <span className="flex-1 text-muted">{fmtDateTime(r.startedAt)} · {r.created} nye · {r.updated} oppdatert · {r.skipped} uendret · {r.errors} feil</span>
                  <ChevronDown size={15} className={clsx('transition', openRun === r.id && 'rotate-180')} />
                </button>
                {openRun === r.id && (
                  <pre className="mx-5 mb-3 max-h-64 overflow-auto rounded-lg bg-ink/[.04] p-3 text-xs leading-relaxed">
                    {r.log.map((l) => `${l.level === 'error' ? '✖' : l.level === 'warn' ? '!' : '·'} ${l.message}`).join('\n') || 'Ingen logg'}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={!!configFor} onClose={() => setConfigFor(null)} title={`Konfigurer ${configFor?.displayName ?? ''}`} wide>
        {configFor && (
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await saveIntegrationConfig(configFor.platform, String(f.get('config')), f.get('enabled') === 'on');
              toast(r.ok ? 'Konfigurasjon lagret' : r.error, r.ok ? 'ok' : 'err');
              if (r.ok) { setConfigFor(null); router.refresh(); }
            });
          }}>
            <p className="text-sm text-muted">Ikke-hemmelige innstillinger (tenant-ID, base-URL, endepunkter). Klient-hemmeligheter og API-nøkler
              settes som miljøvariabler på serveren og lagres aldri i databasen.</p>
            <textarea name="config" rows={8} className="input font-mono text-xs" defaultValue={JSON.stringify(configFor.config, null, 2)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={configFor.status !== 'deaktivert'} /> Aktivert</label>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setConfigFor(null)}>Avbryt</button>
              <button className="btn-primary" disabled={pending}>Lagre</button></div>
          </form>
        )}
      </Modal>
      {toastNode}
    </>
  );
}
