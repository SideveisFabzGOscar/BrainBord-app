'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, LogOut, Moon, Sun } from 'lucide-react';
import { selectChild } from '@/app/(app)/actions';
import { fmtDateTime, relativeDays } from '@/lib/format';
import { ROLE_LABEL, TYPE_LABEL, type ActivityType, type Role } from '@/lib/meta';

export interface Deadline { id: string; title: string; date: string; activityType: ActivityType; subjectName: string | null }

export function Topbar({ fullName, role, kids, currentChild, deadlines }: {
  fullName: string; role: Role; kids: { id: string; full_name: string }[]; currentChild: string | null; deadlines: Deadline[];
}) {
  const [dark, setDark] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [, start] = useTransition();
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!bellRef.current?.contains(e.target as Node)) setBellOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* privat modus */ }
  };
  const urgent = deadlines.filter((d) => new Date(d.date).getTime() - Date.now() < 3 * 86_400_000).length;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-line bg-bg/80 px-4 backdrop-blur lg:px-8">
      {role === 'parent' && kids.length > 1 && (
        <select aria-label="Velg barn" className="input mr-auto ml-12 w-auto py-1.5 lg:ml-0" value={currentChild ?? ''}
          onChange={(e) => start(() => selectChild(e.target.value))}>
          {kids.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      )}
      <div className="relative" ref={bellRef}>
        <button className="btn-ghost relative p-2" aria-label={`Varsler: ${deadlines.length} kommende frister`} onClick={() => setBellOpen((v) => !v)}>
          <Bell size={17} />
          {urgent > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{urgent}</span>}
        </button>
        {bellOpen && (
          <div className="card absolute right-0 top-11 w-80 animate-fade-in p-2 shadow-xl">
            <div className="px-2 py-1.5 text-xs font-medium text-muted">Kommende frister (7 dager)</div>
            {deadlines.length === 0 && <div className="px-2 py-4 text-sm text-muted">Ingen frister den neste uken 🎉</div>}
            {deadlines.map((d) => (
              <Link key={d.id} href={`/arshjul?aktivitet=${d.id}`} className="block rounded-lg px-2 py-2 hover:bg-ink/5" onClick={() => setBellOpen(false)}>
                <div className="truncate text-sm font-medium">{d.title}</div>
                <div className="text-xs text-muted">{TYPE_LABEL[d.activityType]} · {d.subjectName ?? 'Personlig'} · {fmtDateTime(d.date)} ({relativeDays(d.date)})</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <button className="btn-ghost p-2" onClick={toggleTheme} aria-label={dark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}>
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <div className="ml-1 hidden text-right sm:block">
        <div className="text-sm font-medium leading-tight">{fullName}</div>
        <div className="text-[11px] text-muted">{ROLE_LABEL[role]}</div>
      </div>
      <form action="/api/auth/signout" method="post">
        <button className="btn-ghost p-2" aria-label="Logg ut" title="Logg ut"><LogOut size={17} /></button>
      </form>
    </header>
  );
}
