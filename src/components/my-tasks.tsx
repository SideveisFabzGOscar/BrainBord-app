'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTaskStatus } from '@/app/(app)/actions';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, Search } from 'lucide-react';
import { fmtDateTime, relativeDays } from '@/lib/format';
import { sortDelivered, urgency, type UnifiedTask, type Urgency } from '@/lib/unified';
import { priorityOf, type Priority } from '@/lib/bell';
import { SourceBadge, SubmissionBadge } from './source-badge';
import { OpenButton } from './open-button';
import { EmptyState, Select, useToast } from './ui';

const URG: Record<Urgency, { label: string; cls: string }> = {
  forfalt: { label: 'Forfalt', cls: 'border-l-red-500' },
  idag: { label: 'I dag', cls: 'border-l-red-500' },
  snart: { label: 'Innen 3 dager', cls: 'border-l-amber-500' },
  uke: { label: 'Denne uken', cls: 'border-l-blue-500' },
  senere: { label: 'Senere', cls: 'border-l-transparent' },
  ferdig: { label: 'Ferdig', cls: 'border-l-emerald-500' },
};



/** Samme farger som bjella: P1 mørk rød, P2 lyserød, P3 lysegrønn, P4 mørk grønn */
const P_CLS: Record<Priority, string> = {
  1: 'bg-red-800 text-white', 2: 'bg-red-200 text-red-900 dark:bg-red-400 dark:text-red-950',
  3: 'bg-green-200 text-green-900 dark:bg-green-400 dark:text-green-950', 4: 'bg-green-700 text-white',
};
const P_HEAD: Record<Priority | 0, string> = {
  1: 'P1 – fristen har gått ut', 2: 'P2 – frist om 1–7 dager', 3: 'P3 – frist om 7–15 dager', 4: 'P4 – frist om 15–30 dager', 0: 'Frist om mer enn 30 dager',
};
const PChip = ({ p }: { p: Priority }) => <span className={clsx('rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold', P_CLS[p])}>P{p}</span>;

const MY_LABEL: Record<string, string> = { ikke_levert: 'Ikke levert', pagar: 'Pågår', levert: 'Levert' };

/** Elevens statusvalg. Vurderte oppgaver er låst; for Canvas/Teams er det din egen status i Brainbord. */
function StatusPicker({ t, disabled, onChange }: { t: UnifiedTask; disabled: boolean; onChange: (v: string) => void }) {
  if (t.status === 'vurdert') return <SubmissionBadge status="vurdert" />;
  const value = t.status === 'forfalt' ? 'ikke_levert' : (t.status ?? 'ikke_levert');
  const external = t.sources.every((x) => x.source !== 'skolehub');
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <select aria-label={`Status for ${t.title}`} className={clsx('input w-auto py-1 text-xs font-medium',
        value === 'levert' ? 'text-blue-700 dark:text-blue-300' : value === 'pagar' ? 'text-amber-700 dark:text-amber-300' : t.status === 'forfalt' ? 'text-red-700 dark:text-red-300' : '')}
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(MY_LABEL).map(([k, l]) => <option key={k} value={k}>{k === 'ikke_levert' && t.status === 'forfalt' ? 'Ikke levert (forfalt)' : l}</option>)}
      </select>
      {t.myStatus && external && t.sourceStatus && t.sourceStatus !== t.status && (
        <span className="text-[10px] text-muted">{t.sources[0].source === 'teams' ? 'Teams' : 'Canvas'} viser: {t.sourceStatus === 'levert' || t.sourceStatus === 'vurdert' ? 'levert' : 'ikke levert'}</span>
      )}
    </span>
  );
}

export function MyTasks({ tasks, now, canEdit = false }: { tasks: UnifiedTask[]; now: number; canEdit?: boolean }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [pending, start] = useTransition();
  const change = (t: UnifiedTask, status: string) => start(async () => {
    const r = await setTaskStatus(t.sources.map((x) => ({ source: x.source, id: x.id })), status);
    toast(r.ok ? `«${t.title}»: ${MY_LABEL[status].toLowerCase()}` : r.error, r.ok ? 'ok' : 'err');
    if (r.ok) router.refresh();
  });
  const [q, setQ] = useState('');
  const [source, setSource] = useState('alle');
  const [show, setShow] = useState<'apne' | 'alle' | 'ferdige'>('apne');
  const [course, setCourse] = useState('alle');
  const [order, setOrder] = useState<'levert' | 'prioritet'>('levert');
  const courses = useMemo(() => [...new Set(tasks.map((t) => t.courseName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'nb')), [tasks]);

  const filtered = tasks.filter((t) => {
    const u = urgency(t, now);
    if (show === 'apne' && (u === 'ferdig' || (t.dueAt && Date.parse(t.dueAt) < now - 30 * 86_400_000))) return false;
    if (show === 'ferdige' && u !== 'ferdig') return false;
    if (source !== 'alle' && !t.sources.some((x) => x.source === source)) return false;
    if (course !== 'alle' && t.courseName !== course) return false;
    return !q || `${t.title} ${t.courseName ?? ''}`.toLowerCase().includes(q.toLowerCase());
  });  // Levert-visningen: sist leverte øverst. Ellers: etter frist.
  const prio = (t: UnifiedTask): Priority | 0 => (t.dueAt ? priorityOf(t.dueAt, now) ?? 0 : 0);
  const byPriority = show === 'ferdige' && order === 'prioritet';
  const rows = show === 'ferdige'
    ? (byPriority
      // P1 → P4 (deretter over 30 dager); innen hver gruppe: tidligst frist først
      ? [...filtered].sort((a, b) => ((prio(a) || 5) - (prio(b) || 5)) || Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? ''))
      : sortDelivered(filtered))
    : filtered;


  return (
    <>
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input py-1.5 pl-8" placeholder="Søk i oppgaver …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Søk i oppgaver" />
        </div>
        <Select label="Vis" value={show} onChange={(v) => setShow(v as typeof show)}
          options={[{ value: 'apne', label: 'Ikke levert' }, { value: 'ferdige', label: 'Levert' }, { value: 'alle', label: 'Alle' }]} />
        <Select label="Kilde" value={source} onChange={setSource}
          options={[{ value: 'alle', label: 'Alle kilder' }, { value: 'canvas', label: 'Canvas' }, { value: 'teams', label: 'Teams' }, { value: 'skolehub', label: 'Brainbord' }]} />
        {show === 'ferdige' && <Select label="Sortering" value={order} onChange={(v) => setOrder(v as typeof order)}
          options={[{ value: 'levert', label: 'Sist levert først' }, { value: 'prioritet', label: 'Prioritet P1 → P4' }]} />}
        <Select label="Fag" value={course} onChange={setCourse} options={[{ value: 'alle', label: 'Alle fag' }, ...courses.map((c) => ({ value: c, label: c }))]} />
      </div>

      {rows.length === 0 ? <div className="card"><EmptyState title="Ingen oppgaver her" text="Endre filtrene, eller koble til Canvas og Teams under Integrasjoner." /></div> : (
        <ul className="space-y-2">
          {rows.map((t, idx) => {
            const u = urgency(t, now);
            const p = prio(t);
            const header = byPriority && (idx === 0 || prio(rows[idx - 1]) !== p);
            return (
              <li key={t.key} className="list-none">
                {header && <h3 className="mb-2 mt-4 flex items-center gap-2 text-sm font-semibold first:mt-0">{p ? <PChip p={p} /> : null}{P_HEAD[p]}
                  <span className="font-normal text-muted">({rows.filter((x) => prio(x) === p).length})</span></h3>}
              <div className={clsx('card border-l-4 p-4', URG[u].cls)}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p ? <PChip p={p} /> : null}
                      <h4 className="font-medium">{t.title}</h4>
                      {(u === 'idag' || u === 'snart' || u === 'forfalt') && (
                        <span className="chip bg-red-500/10 text-red-700 dark:text-red-300"><AlertTriangle size={11} />{URG[u].label}</span>
                      )}
                      {t.kind === 'prove' && <span className="chip bg-red-500/10 text-red-700 dark:text-red-300">Prøve</span>}
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {t.courseName ?? 'Uten fag'} · {t.dueAt ? <>{fmtDateTime(t.dueAt)} <span className="text-xs">({relativeDays(t.dueAt)})</span></> : 'Ingen frist'}
                      {(t.status === 'levert' || t.status === 'vurdert') && t.deliveredAt && <span className="ml-1 font-medium text-blue-700 dark:text-blue-300">· levert {fmtDateTime(t.deliveredAt)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.grade && <span className="text-sm font-semibold tabular-nums">{t.grade}</span>}
                    {canEdit ? <StatusPicker t={t} disabled={pending} onChange={(v) => change(t, v)} /> : <SubmissionBadge status={t.status} />}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {t.sources.map((x) => <SourceBadge key={x.source + x.id} source={x.source} via={x.via} />)}
                    {t.sources.length > 1 && <span className="text-xs text-muted">Samme oppgave funnet i {t.sources.length} systemer</span>}
                    {t.sources.some((x) => x.internalUrl) && t.open?.kind !== 'intern' && (
                      <Link href={t.sources.find((x) => x.internalUrl)!.internalUrl!} className="text-xs text-accent hover:underline">Vis i årshjulet</Link>
                    )}
                  </div>
                  <OpenButton link={t.open} size="sm" />
                </div>
              </div>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && <p className="mt-4 text-xs text-muted">Status du endrer på Canvas- og Teams-oppgaver gjelder bare i Brainbord. Selve innleveringen gjøres i kildesystemet.</p>}
      {toastNode}
    </>
  );
}
