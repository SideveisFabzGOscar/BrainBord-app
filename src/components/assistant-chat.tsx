'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { CalendarDays, ListOrdered, Loader2, Megaphone, Send, Sparkles, Text } from 'lucide-react';
import type { OpenLink } from '@/lib/links';
import { fmtDateTime } from '@/lib/format';
import { OpenButton } from './open-button';
import { SourceBadge, SubmissionBadge } from './source-badge';

type Mode = 'oppsummer' | 'prioriter' | 'ukeplan' | 'kunngjoringer' | 'sporsmal';
interface Ref { ref: string; title: string; sources: { source: string }[]; open: OpenLink | null }
interface Action { title: string; courseName: string | null; dueAt: string | null; kind: 'oppgave' | 'prove'; status: string | null; sources: string[]; open: OpenLink | null }
interface Answer { q: string; answer: string; engine: 'ai' | 'regelbasert' | 'sok'; note: string; refs: Ref[]; actions: Action[]; example: boolean }

const EXAMPLES = ['Når har jeg neste prøve?', 'Vis meg matteinnleveringen', 'Hvor finner jeg engelskleksa?', 'Åpne prøven jeg har på fredag',
  'Hvilke oppgaver må jeg levere denne uken?'];

const ACTIONS: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: 'oppsummer', label: 'Oppsummer kommende skolearbeid', icon: <Text size={15} /> },
  { mode: 'prioriter', label: 'Hva bør jeg prioritere?', icon: <ListOrdered size={15} /> },
  { mode: 'ukeplan', label: 'Lag en ukeplan', icon: <CalendarDays size={15} /> },
  { mode: 'kunngjoringer', label: 'Oppsummer kunngjøringer', icon: <Megaphone size={15} /> },
];

/** Viser [O3]-referanser som klikkbare merker */
function Rendered({ text, refs }: { text: string; refs: Ref[] }) {
  const parts = text.split(/(\[[OK]\d+\])/g);
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((p, i) => {
        const m = p.match(/^\[([OK]\d+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const r = refs.find((x) => x.ref === m[1]);
        return <a key={i} href={`#ref-${m[1]}`} className="mx-0.5 rounded bg-accent/10 px-1 text-[11px] font-semibold text-accent no-underline" title={r?.title}>{m[1]}</a>;
      })}
    </div>
  );
}

export function AssistantChat({ connected }: { connected: string[] }) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  async function ask(mode: Mode, label: string, question?: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, question }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Assistenten svarte ikke');
      const used = new Set([...String(j.answer).matchAll(/\[([OK]\d+)\]/g)].map((m) => m[1]));
      setAnswers((a) => [{ q: label, answer: j.answer, engine: j.engine, note: j.note, refs: (j.meta?.refs ?? []).filter((r: Ref) => used.has(r.ref)),
        actions: j.actions ?? [], example: !!j.meta?.exampleData }, ...a]);
      setQ('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt'); }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {ACTIONS.map((a) => (
            <button key={a.mode} className="btn-outline justify-start py-3" disabled={busy} onClick={() => ask(a.mode, a.label)}>{a.icon}{a.label}</button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask('sporsmal', q.trim(), q.trim()); }}>
          <label htmlFor="as-q" className="sr-only">Spør om skolearbeidet ditt</label>
          <input id="as-q" className="input" placeholder="Spør om oppgavene og fristene dine …" maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary" disabled={busy || !q.trim()} aria-label="Send">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>
        </form>
        <div className="flex flex-wrap gap-1.5" aria-label="Eksempelspørsmål">
          {EXAMPLES.map((e) => <button key={e} className="chip border border-line py-1 hover:bg-ink/5" disabled={busy} onClick={() => ask('sporsmal', e, e)}>{e}</button>)}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {answers.length === 0 && !busy && (
          <div className="card p-6 text-center text-sm text-muted"><Sparkles className="mx-auto mb-2" size={20} />Velg en handling over, eller still et spørsmål.</div>
        )}
        {busy && answers.length === 0 && <div className="card p-6 text-sm text-muted"><Loader2 size={15} className="mr-2 inline animate-spin" />Ser gjennom dataene dine …</div>}
        {answers.map((a, i) => (
          <article key={i} className="card animate-fade-in p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{a.q}</h2>
              <span className={clsx('chip', a.engine === 'ai' ? 'bg-accent/10 text-accent' : 'bg-ink/[.06] text-muted')}>{a.engine === 'ai' ? 'AI-formulert' : a.engine === 'sok' ? 'Funnet i dine data' : 'Beregnet fra data'}</span>
            </div>
            <Rendered text={a.answer} refs={a.refs} />
            {a.actions.length > 0 && (
              <ul className="mt-4 space-y-2">
                {a.actions.map((x, k) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
                    <div className="min-w-0">
                      <div className="font-medium">{x.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {x.courseName ?? 'Uten fag'}{x.dueAt ? ` · ${fmtDateTime(x.dueAt)}` : ''}
                        {x.sources.map((s) => <SourceBadge key={s} source={s} />)}<SubmissionBadge status={x.status} />
                      </div>
                    </div>
                    <OpenButton link={x.open} size="sm" />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">{a.note}{a.example ? ' Merk: skoledataene er eksempeldata fra en testskole.' : ''}</p>
            {a.refs.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted">Kilder ({a.refs.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {a.refs.map((r) => (
                    <li key={r.ref} id={`ref-${r.ref}`} className="flex flex-wrap items-center gap-2 text-xs">
                      <b className="text-accent">{r.ref}</b><span>{r.title}</span>
                      {r.sources.map((s, k) => <SourceBadge key={k} source={s.source} />)}
                      <OpenButton link={r.open} size="sm" showNote={false} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
      <aside className="card h-fit p-5 text-sm">
        <h2 className="font-medium">Slik fungerer assistenten</h2>
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-muted">
          <li>Bruker bare oppgaver, frister og kunngjøringer du selv har tilgang til.</li>
          <li>Hver opplysning har en referanse, så du kan sjekke kilden.</li>
          <li>Svar som nevner noe som ikke finnes i dataene dine, blir forkastet automatisk.</li>
          <li>Fravær og karakterer sendes ikke til AI-tjenesten.</li>
          <li>Ukeplanen bygger på anslått arbeidstid, fordi timeplanen ikke er tilgjengelig.</li>
        </ul>
        <div className="mt-4 text-xs text-muted">Tilkoblet: {connected.length ? connected.join(', ') : 'ingen'} · <Link className="text-accent hover:underline" href="/integrasjoner">endre</Link></div>
      </aside>
    </div>
  );
}
