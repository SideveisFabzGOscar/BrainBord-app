import clsx from 'clsx';
import { fmtDateTime, relativeDays } from '@/lib/format';
import { urgency, type UnifiedTask } from '@/lib/unified';
import { OpenButton } from './open-button';
import { SourceBadge, SubmissionBadge } from './source-badge';

/** Fire kolonner: kommende prøver, innleveringer, forfalt, levert – hver med direkte lenke til kilden */
export function SmartBoard({ tasks, now }: { tasks: UnifiedTask[]; now: number }) {
  const future = (t: UnifiedTask) => !!t.dueAt && Date.parse(t.dueAt) >= now;
  const cols = [
    { id: 'prover', title: 'Kommende prøver', tone: 'border-t-red-500', items: tasks.filter((t) => t.kind === 'prove' && future(t)).slice(0, 6), empty: 'Ingen kommende prøver' },
    { id: 'innleveringer', title: 'Innleveringer', tone: 'border-t-blue-500',
      items: tasks.filter((t) => t.kind === 'oppgave' && future(t) && t.status !== 'levert' && t.status !== 'vurdert').slice(0, 6), empty: 'Ingen åpne innleveringer' },
    { id: 'forfalt', title: 'Forfalte oppgaver', tone: 'border-t-amber-500',
      items: tasks.filter((t) => t.status === 'forfalt').sort((a, b) => (b.dueAt ?? '').localeCompare(a.dueAt ?? '')).slice(0, 6), empty: 'Ingenting forfalt' },
    { id: 'levert', title: 'Levert', tone: 'border-t-emerald-500',
      items: tasks.filter((t) => (t.status === 'levert' || t.status === 'vurdert') && t.dueAt && Date.parse(t.dueAt) > now - 30 * 86_400_000)
        .sort((a, b) => (b.dueAt ?? '').localeCompare(a.dueAt ?? '')).slice(0, 6), empty: 'Ingenting levert siste 30 dager' },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cols.map((c) => (
        <section key={c.id} className={clsx('card min-w-0 border-t-4', c.tone)} aria-labelledby={`sb-${c.id}`}>
          <h2 id={`sb-${c.id}`} className="flex items-center justify-between border-b border-line px-4 py-3 font-medium">
            {c.title}<span className="text-sm tabular-nums text-muted">{c.items.length}</span>
          </h2>
          {c.items.length === 0 ? <p className="px-4 py-6 text-sm text-muted">{c.empty}</p> : (
            <ul className="divide-y divide-line">
              {c.items.map((t) => {
                const u = urgency(t, now);
                return (
                  <li key={t.key} className="space-y-1.5 px-4 py-3">
                    <div className="text-sm font-medium leading-snug">{t.title}</div>
                    <div className="text-xs text-muted">
                      {t.courseName ?? 'Uten fag'} · {t.dueAt ? fmtDateTime(t.dueAt) : 'ingen frist'}
                      {t.dueAt && (u === 'idag' || u === 'snart') && <span className="ml-1 font-semibold text-red-600 dark:text-red-400">({relativeDays(t.dueAt)})</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.sources.map((x) => <SourceBadge key={x.source + x.id} source={x.source} />)}
                      {c.id === 'levert' && <SubmissionBadge status={t.status} />}
                      {t.grade && <b className="text-xs tabular-nums">{t.grade}</b>}
                    </div>
                    <OpenButton link={t.open} size="sm" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
