'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Link2, Loader2, LogIn, RefreshCw, Unlink } from 'lucide-react';
import { fmtDateTime } from '@/lib/format';
import { useToast } from './ui';

export interface ConnectionCard {
  platform: 'canvas' | 'teams' | 'iskole';
  label: string;
  status: 'ikke_tilkoblet' | 'tilkoblet' | 'feilet';
  accountLabel: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  itemCount: number;
  provides: string[];
  limitations: string[];
  configured: boolean;
  missing: string[];
  notConfiguredReason: string | null;
  docsUrl: string;
  scopes: string[];
}

const STATUS = {
  ikke_tilkoblet: { label: 'Ikke tilkoblet', cls: 'bg-zinc-500/12 text-zinc-600 dark:text-zinc-300' },
  tilkoblet: { label: 'Tilkoblet', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  feilet: { label: 'Tilkobling feilet', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
};

export function ConnectionsPanel({ cards, flash }: { cards: ConnectionCard[]; flash: { platform?: string; ok?: boolean; error?: string } }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (flash.ok) toast(`${cards.find((c) => c.platform === flash.platform)?.label ?? 'Tjenesten'} er koblet til og synkronisert`);
    else if (flash.error) toast(flash.error, 'err');
    if (flash.ok || flash.error) router.replace('/integrasjoner', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(platform: string, action: 'sync' | 'disconnect') {
    setBusy(`${platform}:${action}`);
    try {
      const res = await fetch(`/api/connect/${platform}/${action}`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (action === 'disconnect') toast(res.ok ? 'Koblet fra. Tilgangen og alle hentede data er slettet fra Brainbord.' : j.error ?? 'Kunne ikke koble fra', res.ok ? 'ok' : 'err');
      else toast(res.ok ? `Synkronisert: ${j.itemCount} elementer hentet${j.warnings?.length ? ` (${j.warnings.length} deler manglet tillatelse)` : ''}` : j.message ?? j.error ?? 'Synkronisering feilet', res.ok ? 'ok' : 'err');
    } catch { toast('Nettverksfeil. Prøv igjen.', 'err'); }
    setBusy(null); setConfirming(null);
    router.refresh();
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((c) => {
          const st = STATUS[c.status];
          const connected = c.status === 'tilkoblet';
          return (
            <section key={c.platform} className="card flex flex-col p-5" aria-labelledby={`conn-${c.platform}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={`conn-${c.platform}`} className="font-semibold">{c.label}</h3>
                  <p className="text-xs text-muted">
                    {connected && c.accountLabel ? `Innlogget som ${c.accountLabel}` : c.lastSyncedAt ? '' : 'Aldri synkronisert'}
                    {c.lastSyncedAt && <> · Sist synkronisert {fmtDateTime(c.lastSyncedAt)}</>}
                  </p>
                </div>
                <span className={clsx('chip shrink-0 whitespace-nowrap', st.cls)}>
                  {c.status === 'tilkoblet' ? <CheckCircle2 size={12} /> : c.status === 'feilet' ? <AlertCircle size={12} /> : <Link2 size={12} />}{st.label}
                </span>
              </div>

              {c.lastError && (
                <p role="alert" className={clsx('mt-3 flex gap-1.5 rounded-lg p-2.5 text-xs',
                  c.status === 'feilet' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
                  <AlertCircle size={14} className="mt-px shrink-0" />{c.lastError}
                </p>
              )}

              <div className="mt-4 text-sm">
                <div className="label">Dette vises i Brainbord</div>
                <ul className="space-y-0.5">{c.provides.map((p) => <li key={p} className="flex gap-1.5"><span className="text-emerald-600">✓</span>{p}</li>)}</ul>
                {connected && <p className="mt-1 text-xs text-muted">{c.itemCount} elementer hentet</p>}
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted">Begrensninger og tilgang</summary>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
                  {c.limitations.map((l) => <li key={l}>{l}</li>)}
                  {c.scopes.length > 0 && <li>Tillatelser som er gitt: <code className="break-all">{c.scopes.join(', ')}</code></li>}
                </ul>
                <a className="mt-2 inline-block text-xs text-accent hover:underline" href={c.docsUrl} target="_blank" rel="noreferrer">Offisiell dokumentasjon ↗</a>
              </details>

              {!c.configured && (
                <div className="mt-3 rounded-lg bg-ink/[.04] p-3 text-xs">
                  <div className="font-medium">{c.notConfiguredReason}</div>
                  <ul className="mt-1 list-inside list-disc text-muted">{c.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {!connected && (
                  c.configured
                    ? <a className="btn-primary" href={`/api/connect/${c.platform}/start`}><LogIn size={15} /> {c.status === 'feilet' ? 'Koble til på nytt' : 'Koble til'}</a>
                    : <button className="btn-primary" disabled title="Ikke tilgjengelig ennå"><LogIn size={15} /> Koble til</button>
                )}
                {connected && (
                  <button className="btn-primary" disabled={!!busy} onClick={() => post(c.platform, 'sync')}>
                    {busy === `${c.platform}:sync` ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Synkroniser
                  </button>
                )}
                {(connected || c.status === 'feilet') && (confirming === c.platform ? (
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span>Slette tilgang og alle hentede data?</span>
                    <button className="btn-outline px-2 py-1 text-xs text-red-600" disabled={!!busy} onClick={() => post(c.platform, 'disconnect')}>Ja, koble fra</button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirming(null)}>Avbryt</button>
                  </span>
                ) : (
                  <button className="btn-outline" disabled={!!busy} onClick={() => setConfirming(c.platform)}><Unlink size={15} /> Koble fra</button>
                ))}
              </div>
              {c.configured && !connected && (
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  Du sendes til {c.platform === 'teams' ? 'Microsoft' : 'Canvas'} for å logge inn. Brainbord ser aldri passordet ditt, og tofaktor gjøres hos dem.
                </p>
              )}
            </section>
          );
        })}
      </div>
      {toastNode}
    </>
  );
}
