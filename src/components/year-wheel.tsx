'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Filter, Plus, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { addDays, fmtDateShort, fmtWeekday, isoWeek, MONTHS, MONTHS_LONG, sameDay, startOfWeek, WEEKDAYS } from '@/lib/format';
import { COLOR_GROUP_OF, GROUP_META, STATUS_META, type ColorGroup, type Role, type WorkStatus } from '@/lib/meta';
import type { ActivityItem } from '@/lib/data';
import { ActivityDetail, CreateActivityModal, type SubjectOption } from './activity-forms';
import { Drawer, EmptyState, Select, StatusBadge, TypeBadge, useToast } from './ui';

type View = 'ar' | 'maned' | 'uke';
const GROUPS = Object.keys(GROUP_META) as ColorGroup[];

export function YearWheel({ activities, subjects, role, yearStart, yearEnd, yearLabel, initialActivityId, managedSubjectIds }: {
  activities: ActivityItem[]; subjects: SubjectOption[]; role: Role; yearStart: string; yearEnd: string; yearLabel: string;
  initialActivityId?: string | null; managedSubjectIds: string[];
}) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [view, setView] = useState<View>('ar');
  const [cursor, setCursor] = useState(() => new Date());
  const [subject, setSubject] = useState('alle');
  const [groups, setGroups] = useState<Set<ColorGroup>>(new Set(GROUPS));
  const [status, setStatus] = useState<'alle' | WorkStatus>('alle');
  const [selectedId, setSelectedId] = useState<string | null>(initialActivityId ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [live, setLive] = useState(false);

  // Automatisk oppdatering når aktiviteter opprettes/importeres (Supabase Realtime, følger RLS)
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => router.refresh(), 400); };
    const ch = supabase.channel('arshjul')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tests' }, refresh)
      .subscribe((st) => setLive(st === 'SUBSCRIBED'));
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [router]);

  useEffect(() => {
    if (!initialActivityId) return;
    const a = activities.find((x) => x.id === initialActivityId);
    if (a) setCursor(new Date(a.date));
  }, [initialActivityId, activities]);

  const filtered = useMemo(() => activities.filter((a) =>
    (subject === 'alle' || (subject === 'personlig' ? a.personal : a.subjectId === subject))
    && groups.has(COLOR_GROUP_OF[a.activityType])
    && (status === 'alle' || a.status === status)), [activities, subject, groups, status]);

  const selected = activities.find((a) => a.id === selectedId) ?? null;
  /** Bare lærer og admin kan legge ut oppgaver og prøver. Elever og foresatte har lesetilgang. */
  const canCreate = role === 'teacher' || role === 'admin';
  const notify = (msg: string, ok: boolean, close?: boolean) => { toast(msg, ok ? 'ok' : 'err'); if (close) setSelectedId(null); };

  const step = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'maned') d.setMonth(d.getMonth() + dir);
    else if (view === 'uke') d.setDate(d.getDate() + 7 * dir);
    setCursor(d);
  };
  const openCreate = (date?: Date) => {
    setCreateDate(date ? date.toLocaleDateString('sv-SE') : undefined);
    setCreateOpen(true);
  };

  const title = view === 'ar' ? `Skoleåret ${yearLabel}`
    : view === 'maned' ? `${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`
    : `Uke ${isoWeek(cursor)} · ${fmtDateShort(startOfWeek(cursor))} – ${fmtDateShort(addDays(startOfWeek(cursor), 6))}`;

  return (
    <div className="space-y-4">
      {/* Verktøylinje */}
      <div className="card flex flex-wrap items-center gap-2 p-2">
        <div role="tablist" aria-label="Visning" className="flex rounded-lg bg-ink/5 p-0.5">
          {([['ar', 'År'], ['maned', 'Måned'], ['uke', 'Uke']] as [View, string][]).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={clsx('rounded-md px-3 py-1.5 text-sm transition', view === v ? 'bg-panel font-medium shadow-low' : 'text-muted hover:text-ink')}>{l}</button>
          ))}
        </div>
        {view !== 'ar' && (
          <div className="flex items-center">
            <button className="btn-ghost p-1.5" onClick={() => step(-1)} aria-label="Forrige"><ChevronLeft size={16} /></button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setCursor(new Date())}>I dag</button>
            <button className="btn-ghost p-1.5" onClick={() => step(1)} aria-label="Neste"><ChevronRight size={16} /></button>
          </div>
        )}
        <div className="min-w-0 flex-1 truncate px-1 text-sm font-medium capitalize">{title}</div>
        <span className={clsx('hidden items-center gap-1 text-xs sm:flex', live ? 'text-emerald-600' : 'text-muted')} title="Oppdateres automatisk ved import">
          <Radio size={13} /> {live ? 'Live' : 'Kobler til …'}
        </span>
        <Filter size={14} className="text-muted" aria-hidden />
        <Select label="Filtrer på fag" value={subject} onChange={setSubject}
          options={[{ value: 'alle', label: 'Alle fag' }, ...subjects.map((s) => ({ value: s.id, label: s.name + (s.className ? ` (${s.className})` : '') })),
            ...(role === 'student' || role === 'parent' ? [{ value: 'personlig', label: 'Personlige' }] : [])]} />
        <Select label="Filtrer på status" value={status} onChange={(v) => setStatus(v as typeof status)}
          options={[{ value: 'alle', label: 'Alle statuser' }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label }))]} />
        {canCreate && <button className="btn-primary" onClick={() => openCreate()}><Plus size={15} /> Ny aktivitet</button>}
      </div>

      {/* Fargeforklaring = typefilter */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer på aktivitetstype">
        {GROUPS.map((g) => {
          const on = groups.has(g);
          const n = activities.filter((a) => COLOR_GROUP_OF[a.activityType] === g).length;
          return (
            <button key={g} aria-pressed={on} onClick={() => setGroups((prev) => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s.size ? s : new Set(GROUPS); })}
              className={clsx('chip border py-1 transition', on ? 'border-line bg-panel' : 'border-transparent opacity-40')}>
              <span className="h-2 w-2 rounded-full" style={{ background: GROUP_META[g].hex }} />{GROUP_META[g].label}
              <span className="text-muted tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      {view === 'ar' && <WheelView items={filtered} yearStart={new Date(yearStart)} yearEnd={new Date(yearEnd)} yearLabel={yearLabel}
        onSelect={setSelectedId} onMonth={(d) => { setCursor(d); setView('maned'); }} />}
      {view === 'maned' && <MonthView items={filtered} cursor={cursor} onSelect={setSelectedId} onDay={canCreate ? openCreate : undefined} />}
      {view === 'uke' && <WeekView items={filtered} cursor={cursor} onSelect={setSelectedId} />}

      <Drawer open={!!selected} onClose={() => setSelectedId(null)} title={selected?.title ?? ''}>
        {selected && <ActivityDetail a={selected} role={role} onChanged={notify}
          canManage={(role === 'teacher' || role === 'admin') && !!selected.subjectId && managedSubjectIds.includes(selected.subjectId)} />}
      </Drawer>
      <CreateActivityModal open={createOpen} onClose={() => setCreateOpen(false)} subjects={role === 'teacher' ? subjects.filter((s) => managedSubjectIds.includes(s.id)) : subjects}
        role={role} defaultDate={createDate} onDone={(m, ok) => toast(m, ok ? 'ok' : 'err')} />
      {toastNode}
    </div>
  );
}

/* ---------------------------- Årsvisning (hjul) ---------------------------- */
function WheelView({ items, yearStart, yearEnd, yearLabel, onSelect, onMonth }: {
  items: ActivityItem[]; yearStart: Date; yearEnd: Date; yearLabel: string; onSelect: (id: string) => void; onMonth: (d: Date) => void;
}) {
  const [hover, setHover] = useState<{ a: ActivityItem; x: number; y: number } | null>(null);
  const size = 640, c = size / 2, R = 300;
  // Hjulet dekker 12 måneder fra skoleårets startmåned
  const start = new Date(yearStart.getFullYear(), yearStart.getMonth(), 1);
  const end = new Date(start.getFullYear() + 1, start.getMonth(), 1);
  const span = end.getTime() - start.getTime();
  const angleOf = (d: Date) => ((d.getTime() - start.getTime()) / span) * 2 * Math.PI - Math.PI / 2;
  const polar = (r: number, ang: number) => [c + r * Math.cos(ang), c + r * Math.sin(ang)] as const;
  const months = Array.from({ length: 12 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
  const ringR = (g: ColorGroup) => 255 - GROUPS.indexOf(g) * 26;
  const now = new Date();
  const inYear = items.filter((a) => { const d = new Date(a.date); return d >= start && d < end; });

  // Spre prikker som havner på samme dag i samme ring
  const placed = useMemo(() => {
    const seen = new Map<string, number>();
    return inYear.map((a) => {
      const g = COLOR_GROUP_OF[a.activityType];
      const key = `${g}|${new Date(a.date).toDateString()}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const [x, y] = polar(ringR(g) + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 7, angleOf(new Date(a.date)));
      return { a, g, x, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inYear]);

  const arc = (r1: number, r2: number, a1: number, a2: number) => {
    const [x1, y1] = polar(r2, a1), [x2, y2] = polar(r2, a2), [x3, y3] = polar(r1, a2), [x4, y4] = polar(r1, a1);
    const large = a2 - a1 > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${r2},${r2} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 ${large} 0 ${x4},${y4} Z`;
  };
  const upcoming = items.filter((a) => new Date(a.date) >= now).slice(0, 6);
  const pastShare = Math.min(1, Math.max(0, (now.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime())));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className="card relative p-2 sm:p-4">
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[680px]" role="img"
          aria-label={`Årshjul for ${yearLabel} med ${inYear.length} aktiviteter`}>
          {/* Månedssegmenter (klikk = gå til måned) */}
          {months.map((m, i) => {
            const a1 = angleOf(m), a2 = angleOf(new Date(m.getFullYear(), m.getMonth() + 1, 1));
            const [lx, ly] = polar(R - 14, (a1 + a2) / 2);
            const isNow = m.getMonth() === now.getMonth() && m.getFullYear() === now.getFullYear();
            return (
              <g key={i} className="cursor-pointer" onClick={() => onMonth(m)}>
                <path d={arc(100, R, a1, a2)} fill={i % 2 ? 'rgb(var(--ink) / 0.025)' : 'transparent'} stroke="rgb(var(--line))" strokeWidth={1} />
                <path d={arc(R - 28, R, a1, a2)} fill={isNow ? 'rgb(var(--accent) / 0.15)' : 'rgb(var(--ink) / 0.04)'} className="transition hover:fill-[rgb(var(--accent)/0.12)]" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={isNow ? 700 : 500}
                  fill={isNow ? 'rgb(var(--accent))' : 'rgb(var(--muted))'} className="pointer-events-none select-none uppercase tracking-wide">{MONTHS[m.getMonth()]}</text>
              </g>
            );
          })}
          {/* Spor per aktivitetsgruppe */}
          {GROUPS.map((g) => <circle key={g} cx={c} cy={c} r={ringR(g)} fill="none" stroke={GROUP_META[g].hex} strokeOpacity={0.18} strokeWidth={1.5} />)}
          {/* I dag-markør */}
          {(() => { const [x1, y1] = polar(100, angleOf(now)), [x2, y2] = polar(R, angleOf(now));
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(var(--accent))" strokeWidth={2} strokeDasharray="4 3" />; })()}
          {/* Aktiviteter */}
          {placed.map(({ a, g, x, y }) => {
            const done = a.status === 'levert' || a.status === 'fullfort';
            return (
              <circle key={a.id} cx={x} cy={y} r={hover?.a.id === a.id ? 7 : 5}
                fill={done ? 'rgb(var(--panel))' : GROUP_META[g].hex} stroke={GROUP_META[g].hex} strokeWidth={2}
                className="cursor-pointer transition-[r]" tabIndex={0} role="button"
                aria-label={`${a.title}, ${fmtDateShort(a.date)}`}
                onMouseEnter={() => setHover({ a, x, y })} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover({ a, x, y })} onBlur={() => setHover(null)}
                onClick={() => onSelect(a.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(a.id)} />
            );
          })}
          {/* Senter */}
          <circle cx={c} cy={c} r={98} fill="rgb(var(--panel))" stroke="rgb(var(--line))" />
          <circle cx={c} cy={c} r={84} fill="none" stroke="rgb(var(--ink) / 0.06)" strokeWidth={8} />
          <circle cx={c} cy={c} r={84} fill="none" stroke="rgb(var(--accent))" strokeWidth={8} strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 84 * pastShare} ${2 * Math.PI * 84}`} transform={`rotate(-90 ${c} ${c})`} />
          <text x={c} y={c - 14} textAnchor="middle" fontSize={13} fill="rgb(var(--muted))">Skoleåret</text>
          <text x={c} y={c + 8} textAnchor="middle" fontSize={22} fontWeight={700} fill="rgb(var(--ink))">{yearLabel}</text>
          <text x={c} y={c + 30} textAnchor="middle" fontSize={12} fill="rgb(var(--muted))">{Math.round(pastShare * 100)} % gjennomført</text>
        </svg>
        {hover && (
          <div className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel p-2.5 text-xs shadow-pop"
            style={{ left: `calc(${(hover.x / size) * 100}% )`, top: `calc(${(hover.y / size) * 100}% - 10px)` }}>
            <div className="font-medium">{hover.a.title}</div>
            <div className="mt-0.5 text-muted">{hover.a.subjectName ?? 'Personlig'} · {fmtWeekday(hover.a.date)}</div>
          </div>
        )}
        <p className="mt-2 text-center text-xs text-muted">Fylt prikk = ikke levert · Hul prikk = levert/fullført · Klikk en måned for å zoome inn</p>
      </div>
      <aside className="card h-fit">
        <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Neste i årshjulet</h2>
        {upcoming.length === 0 ? <EmptyState title="Ingenting kommende" text="Juster filtrene for å se flere." /> : (
          <ul className="divide-y divide-line">
            {upcoming.map((a) => (
              <li key={a.id}>
                <button className="w-full px-4 py-3 text-left transition hover:bg-ink/[.03]" onClick={() => onSelect(a.id)}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GROUP_META[COLOR_GROUP_OF[a.activityType]].hex }} />
                    <span className="truncate text-sm font-medium">{a.title}</span>
                  </div>
                  <div className="mt-0.5 pl-4 text-xs text-muted">{fmtWeekday(a.date)} · {a.subjectName ?? 'Personlig'}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/* ---------------------------- Månedsvisning ---------------------------- */
function MonthView({ items, cursor, onSelect, onDay }: {
  items: ActivityItem[]; cursor: Date; onSelect: (id: string) => void; onDay?: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-ink/[.02]">
        {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center text-xs font-medium uppercase text-muted">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = items.filter((a) => sameDay(new Date(a.date), d));
          const other = d.getMonth() !== cursor.getMonth();
          return (
            <div key={d.toISOString()} className={clsx('group min-h-[92px] border-b border-r border-line p-1.5 sm:min-h-[112px]', other && 'bg-ink/[.02]')}>
              <div className="mb-1 flex items-center justify-between">
                <span className={clsx('grid h-6 w-6 place-items-center rounded-full text-xs', sameDay(d, today) ? 'bg-accent font-semibold text-white' : other ? 'text-muted/60' : 'text-muted')}>{d.getDate()}</span>
                {onDay && <button className="hidden rounded p-0.5 text-muted hover:bg-ink/5 group-hover:block" onClick={() => onDay(d)} aria-label={`Ny aktivitet ${d.toLocaleDateString('nb-NO')}`}><Plus size={13} /></button>}
              </div>
              <div className="space-y-1">
                {list.slice(0, 3).map((a) => {
                  const g = GROUP_META[COLOR_GROUP_OF[a.activityType]];
                  const done = a.status === 'levert' || a.status === 'fullfort';
                  return (
                    <button key={a.id} onClick={() => onSelect(a.id)} title={a.title}
                      className={clsx('block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium', g.soft, g.text, done && 'line-through opacity-60')}>
                      {a.title}
                    </button>
                  );
                })}
                {list.length > 3 && <div className="px-1 text-[11px] text-muted">+{list.length - 3} til</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------- Ukesvisning ---------------------------- */
function WeekView({ items, cursor, onSelect }: { items: ActivityItem[]; cursor: Date; onSelect: (id: string) => void }) {
  const ws = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = new Date();
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const list = items.filter((a) => sameDay(new Date(a.date), d));
        return (
          <div key={d.toISOString()} className={clsx('card min-h-[160px] p-2', sameDay(d, today) && 'ring-2 ring-accent/40')}>
            <div className="mb-2 px-1 text-xs font-medium capitalize text-muted">{fmtWeekday(d)}</div>
            <div className="space-y-2">
              {list.length === 0 && <div className="px-1 text-xs text-muted/60">–</div>}
              {list.map((a) => (
                <button key={a.id} onClick={() => onSelect(a.id)}
                  className="block w-full rounded-lg border border-line p-2 text-left transition hover:border-accent/40 hover:shadow-lift"
                  style={{ borderLeft: `3px solid ${GROUP_META[COLOR_GROUP_OF[a.activityType]].hex}` }}>
                  <div className="text-xs font-medium leading-snug">{a.title}</div>
                  <div className="mt-1 text-[11px] text-muted">{a.subjectName ?? 'Personlig'} · {new Date(a.date).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' })}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1"><TypeBadge type={a.activityType} /><StatusBadge status={a.status} /></div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
