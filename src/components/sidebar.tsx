'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  BookOpen, CalendarRange, ClipboardCheck, FileCheck2, FileLock2, GraduationCap, Layers, LayoutDashboard, ListChecks, ListTodo, Menu,
  PlugZap, Route, Settings, Sparkles, UserX, Workflow, X,
} from 'lucide-react';
import type { Role } from '@/lib/meta';

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; onlyFor?: Role[]; hideFor?: Role[] }[] = [
  { href: '/classflow', label: 'ClassFlow', icon: Workflow, onlyFor: ['teacher', 'admin'] as Role[] },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/samlet', label: 'Samlet oversikt', icon: Layers },
  { href: '/mine-oppgaver', label: 'Mine oppgaver', icon: ListChecks },
  { href: '/assistent', label: 'Assistent', icon: Sparkles },
  { href: '/plan', label: 'Gjennomføringsplan', icon: Route, onlyFor: ['student', 'parent'] as Role[] },
  { href: '/arshjul', label: 'Årshjul', icon: CalendarRange },
  { href: '/oppgaver', label: 'Oppgaver', icon: ListTodo },
  { href: '/innleveringer', label: 'Innleveringer', icon: FileCheck2 },
  { href: '/prover', label: 'Prøver', icon: ClipboardCheck },
  { href: '/fravaer', label: 'Fravær', icon: UserX },
  { href: '/dokumentasjon', label: 'Dokumentasjon', icon: FileLock2, hideFor: ['teacher'] as Role[] },
  { href: '/fag', label: 'Fag', icon: BookOpen },
  { href: '/integrasjoner', label: 'Integrasjoner', icon: PlugZap },
  { href: '/innstillinger', label: 'Innstillinger', icon: Settings },
];

export function Sidebar({ role, schoolName }: { role: Role; schoolName: string | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const items = NAV.filter((n) => (!n.onlyFor || n.onlyFor.includes(role)) && !n.hideFor?.includes(role));

  const nav = (
    <nav className="flex h-full flex-col gap-0.5 p-3">
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white"><GraduationCap size={18} /></div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">{role === 'teacher' || role === 'admin' ? 'ClassFlow' : 'Brainbord'}</div>
          <div className="truncate text-[11px] text-muted">{schoolName ?? '–'}</div>
        </div>
      </div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + '/');
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
              active ? 'bg-ink/[.07] font-medium text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink')}>
            <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />{label}
          </Link>
        );
      })}
      <div className="mt-auto px-2.5 pt-4 text-[11px] leading-relaxed text-muted">
        Personopplysninger behandles etter GDPR. Tilgang logges.
      </div>
    </nav>
  );

  return (
    <>
      <button className="btn-ghost fixed left-3 top-3 z-40 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Åpne meny"><Menu size={18} /></button>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-panel/60 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="shadow-float h-full w-64 animate-fade-in border-r border-line bg-panel" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost absolute left-52 top-3 p-2" onClick={() => setOpen(false)} aria-label="Lukk meny"><X size={18} /></button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
