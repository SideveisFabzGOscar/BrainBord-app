'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowUpRight, Bell, LogOut, Moon, Sun } from 'lucide-react';
import { selectChild } from '@/app/(app)/actions';
import type { BellItem, Priority } from '@/lib/bell';
import type { Mood } from '@/lib/catchup';
import { MoodFace, MOOD } from './mood-face';
import { fmtDateTime, relativeDays } from '@/lib/format';
import { ROLE_LABEL, type Role } from '@/lib/meta';

/** P1 mørk rød, P2 lyserød, P3 lysegrønn, P4 mørk grønn */
const P_STYLE: Record<Priority, { cls: string; label: string }> = {
  1: { cls: 'bg-red-800 text-white', label: 'Utløpt' },
  2: { cls: 'bg-red-200 text-red-900 dark:bg-red-400 dark:text-red-950', label: '1–7 dager' },
  3: { cls: 'bg-green-200 text-green-900 dark:bg-green-400 dark:text-green-950', label: '7–15 dager' },
  4: { cls: 'bg-green-700 text-white', label: '15–30 dager' },
};

function BellRow({ item, onPick }: { item: BellItem; onPick: () => void }) {
  const cls = clsx('flex w-full gap-2.5 rounded-lg border-l-4 px-3 py-2 text-left transition hover:brightness-95',
    item.late ? 'border-red-600 bg-red-500/10 dark:border-red-400' : 'border-green-600 bg-green-500/10 dark:border-green-400');
  const body = (
    <>
      <span className={clsx('mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold', P_STYLE[item.priority].cls)}>P{item.priority}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">{item.title}</span>
        <span className="block text-xs text-muted">{item.courseName ?? 'Uten fag'} · {fmtDateTime(item.dueAt)} · {relativeDays(item.dueAt)}</span>
      </span>
      {item.open?.external && <ArrowUpRight size={14} className="mt-1 shrink-0 text-muted" aria-hidden />}
    </>
  );
  if (!item.open) return <div className={cls}>{body}</div>;
  return item.open.external
    ? <a href={item.open.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onPick} aria-label={`${item.title}: ${item.open.label}`}>{body}</a>
    : <Link href={item.open.href} className={cls} onClick={onPick}>{body}</Link>;
}

export function Topbar({ fullName, role, kids, currentChild, bell }: {
  fullName: string; role: Role; kids: { id: string; full_name: string }[]; currentChild: string | null;
  bell: { items: BellItem[]; lateCount: number; mood: Mood } | null;
}) {
  const [dark, setDark] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [, start] = useTransition();
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!bellRef.current?.contains(e.target as Node)) setBellOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBellOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* privat modus */ }
  };
  const late = bell?.items.filter((i) => i.late) ?? [];
  const soon = bell?.items.filter((i) => !i.late) ?? [];
  const count = bell?.lateCount ?? 0;

  return (
    <header className="shadow-header sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-line bg-bg/80 px-4 backdrop-blur lg:px-8">
      {role === 'parent' && kids.length > 1 && (
        <select aria-label="Velg barn" className="input mr-auto ml-12 w-auto py-1.5 lg:ml-0" value={currentChild ?? ''}
          onChange={(e) => start(() => selectChild(e.target.value))}>
          {kids.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      )}
      <button className="btn-ghost p-2" onClick={toggleTheme} aria-label={dark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}>
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <div className="ml-1 hidden text-right sm:block">
        <div className="text-sm font-medium leading-tight">{fullName}</div>
        <div className="text-[11px] text-muted">{ROLE_LABEL[role]}</div>
      </div>

      {bell && (
        <Link href="/plan" className="btn-ghost p-0.5" title={`${MOOD[bell.mood].label}. Se gjennomføringsplan`} aria-label={`${MOOD[bell.mood].label}. Åpne gjennomføringsplan`}>
          <MoodFace mood={bell.mood} size={40} />
        </Link>
      )}
      {bell && (
        <div className="relative" ref={bellRef}>
          <button className="btn-ghost relative p-2" aria-haspopup="true" aria-expanded={bellOpen} onClick={() => setBellOpen((v) => !v)}
            aria-label={count ? `Varsler: ${count} utløpte oppgaver` : 'Varsler: ingen utløpte oppgaver'}>
            <Bell size={18} />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="card absolute right-0 top-12 max-h-[70vh] w-[min(400px,calc(100vw-2rem))] animate-fade-in overflow-y-auto pb-2 shadow-pop" role="dialog" aria-label="Varsler">
              <div className="px-4 pb-2 pt-3 text-sm font-semibold">Oppgaver og prøver</div>
              <div className="flex flex-wrap gap-2 border-b border-line px-4 pb-2.5 text-[11px] text-muted">
                {([1, 2, 3, 4] as Priority[]).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1">
                    <span className={clsx('rounded px-1.5 py-0.5 font-mono font-extrabold', P_STYLE[p].cls)}>P{p}</span>{P_STYLE[p].label}
                  </span>
                ))}
              </div>
              <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Utløpt ({late.length})</div>
              <div className="space-y-1.5 px-2">
                {late.length ? late.map((i) => <BellRow key={i.key} item={i} onPick={() => setBellOpen(false)} />)
                  : <p className="px-2 text-sm text-muted">Ingen utløpte oppgaver.</p>}
              </div>
              <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">Forfaller de neste 30 dagene ({soon.length})</div>
              <div className="space-y-1.5 px-2">
                {soon.length ? soon.map((i) => <BellRow key={i.key} item={i} onPick={() => setBellOpen(false)} />)
                  : <p className="px-2 text-sm text-muted">Ingen frister de neste 30 dagene.</p>}
              </div>
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <p className="text-[11px] text-muted">Varseltallet teller bare utløpte oppgaver som ikke er levert.</p>
                <Link href="/plan" className="btn-primary shrink-0 px-2.5 py-1 text-xs" onClick={() => setBellOpen(false)}>Lag plan</Link>
              </div>
            </div>
          )}
        </div>
      )}

      <form action="/api/auth/signout" method="post">
        <button className="btn-ghost p-2" aria-label="Logg ut" title="Logg ut"><LogOut size={17} /></button>
      </form>
    </header>
  );
}
