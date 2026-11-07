'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { setSolved } from '@/app/(app)/actions';
import type { BellItem, Priority } from '@/lib/bell';
import type { CatchUpPlan } from '@/lib/catchup';
import { fmtDateTime, relativeDays } from '@/lib/format';
import type { OpenLink } from '@/lib/links';
import { OpenButton } from './open-button';
import { SourceBadge } from './source-badge';
import { EmptyState, useToast } from './ui';

export interface SolvedItem { key: string; refs: { source: string; id: string }[]; title: string; courseName: string | null; dueAt: string | null; solvedAt: string; sources: string[]; open: OpenLink | null }

const P_CLS: Record<Priority, string> = {
  1: 'bg-red-800 text-white', 2: 'bg-red-200 text-red-900 dark:bg-red-400 dark:text-red-950',
  3: 'bg-green-200 text-green-900 dark:bg-green-400 dark:text-green-950', 4: 'bg-green-700 text-white',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SolveBox({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium">
      <input type="checkbox" className="h-5 w-5 cursor-pointer accent-green-700" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="hidden sm:inline">Løst</span>
    </label>
  );
}

export function PlanBoard({ plan, solved }: { plan: CatchUpPlan; solved: SolvedItem[] }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [view, setView] = useState<'plan' | 'losning'>('plan');
  const [pending, start] = useTransition();
  // Skjul umiddelbart det brukeren huker av, mens serveren oppdaterer
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (key: string, refs: { source: string; id: string }[], title: string, value: boolean) => {
    setHidden((h) => new Set(h).add(key));
    start(async () => {
      const r = await setSolved(refs, value);
      if (!r.ok) { setHidden((h) => { const n = new Set(h); n.delete(key); return n; }); toast(r.error, 'err'); return; }
      toast(value ? `«${title}» er markert som løst` : `«${title}» er lagt tilbake i planen`);
      router.refresh();
      setHidden(new Set());
    });
  };

  const days = plan.days.map((d) => ({ ...d, items: d.items.filter((i) => !hidden.has(i.key)) })).filter((d) => d.items.length);
  const solvedVisible = solved.filter((s) => !hidden.has(s.key));

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Visning">
        <button role="tab" aria-selected={view === 'plan'} className={view === 'plan' ? 'btn-primary' : 'btn-outline'} onClick={() => setView('plan')}>
          <ListChecks size={15} /> Plan
        </button>
        <button role="tab" aria-selected={view === 'losning'} className={view === 'losning' ? 'btn-primary' : 'btn-outline'} onClick={() => setView('losning')}>
          <CheckCircle2 size={15} /> Løste oppgaver ({solvedVisible.length})
        </button>
      </div>

      {view === 'plan' && (
        <>
          {plan.lateScheduled > 0 && (
            <p className="mb-4 flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              {plan.lateScheduled} {plan.lateScheduled === 1 ? 'oppgave havner' : 'oppgaver havner'} etter fristen fordi utløpte oppgaver tas først. Vurder å gjøre dem tidligere, eller snakk med læreren.
            </p>
          )}
          {days.length === 0 ? <div className="card"><EmptyState title="Ingenting å planlegge" text="Alt er løst eller levert. Godt jobbet!" /></div> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {days.map((d) => (
                <section key={d.date} className="card p-4">
                  <h2 className="mb-3 font-medium">{cap(new Date(`${d.date}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' }))}</h2>
                  <ol className="space-y-3">
                    {d.items.map((i: BellItem & { afterDeadline: boolean }, n) => (
                      <li key={i.key} className={clsx('rounded-lg border-l-4 p-3', i.late ? 'border-red-600 bg-red-500/10' : 'border-green-600 bg-green-500/10')}>
                        <div className="flex items-start gap-2">
                          <span className={clsx('rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold', P_CLS[i.priority])}>P{i.priority}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{n + 1}. {i.title}</div>
                            <div className="text-xs text-muted">{i.courseName ?? 'Uten fag'} · frist {fmtDateTime(i.dueAt)} ({relativeDays(i.dueAt)})</div>
                            {i.afterDeadline && <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Planlagt etter fristen</div>}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">{i.sources.map((x) => <SourceBadge key={x} source={x} />)}<OpenButton link={i.open} size="sm" showNote={false} /></div>
                          </div>
                          <SolveBox checked={false} disabled={pending} label={`Marker «${i.title}» som løst`} onChange={(v) => toggle(i.key, i.refs, i.title, v)} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">«Løst» er din egen markering i Brainbord. Husk å levere i Canvas eller Teams; markeringen endrer ikke innleveringen der.</p>
        </>
      )}

      {view === 'losning' && (
        solvedVisible.length === 0 ? <div className="card"><EmptyState title="Ingen løste oppgaver ennå" text="Huk av «Løst» i planen, så havner oppgaven her." /></div> : (
          <div className="card divide-y divide-line">
            {solvedVisible.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <SolveBox checked disabled={pending} label={`Fjern «Løst» fra «${s.title}» (ikke løst likevel)`} onChange={(v) => !v && toggle(s.key, s.refs, s.title, false)} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium line-through decoration-muted/60">{s.title}</div>
                  <div className="text-xs text-muted">{s.courseName ?? 'Uten fag'}{s.dueAt ? ` · frist ${fmtDateTime(s.dueAt)}` : ''} · markert løst {fmtDateTime(s.solvedAt)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">{s.sources.map((x) => <SourceBadge key={x} source={x} />)}<OpenButton link={s.open} size="sm" showNote={false} /></div>
              </div>
            ))}
            <p className="px-4 py-3 text-xs text-muted">Fjern haken hvis oppgaven likevel ikke er løst, så legges den tilbake i planen.</p>
          </div>
        )
      )}
      {toastNode}
    </>
  );
}
