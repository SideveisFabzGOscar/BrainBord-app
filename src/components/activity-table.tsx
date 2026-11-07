'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { fmtDateTime, relativeDays } from '@/lib/format';
import { PLATFORM_LABEL, STATUS_META, TYPE_LABEL, type ActivityType, type Role } from '@/lib/meta';
import type { ActivityItem } from '@/lib/data';
import { ActivityDetail, CreateActivityModal, type SubjectOption } from './activity-forms';
import { Drawer, EmptyState, Select, StatusBadge, TypeBadge, useToast } from './ui';

export function ActivityTable({ items, subjects, role, managed, types, createLabel }: {
  items: ActivityItem[]; subjects: SubjectOption[]; role: Role; managed: string[]; types: ActivityType[]; createLabel: string;
}) {
  const { toast, toastNode } = useToast();
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('alle');
  const [type, setType] = useState('alle');
  const [status, setStatus] = useState('alle');
  const [when, setWhen] = useState<'kommende' | 'tidligere' | 'alle'>('kommende');
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const now = Date.now();

  const rows = useMemo(() => items.filter((a) => {
    const t = new Date(a.date).getTime();
    return (when === 'alle' || (when === 'kommende' ? t >= now - 86_400_000 : t < now))
      && (subject === 'alle' || a.subjectId === subject)
      && (type === 'alle' || a.activityType === type)
      && (status === 'alle' || a.status === status)
      && (!q || `${a.title} ${a.subjectName ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  }).sort((a, b) => (when === 'tidligere' ? -1 : 1) * (Date.parse(a.date) - Date.parse(b.date))), [items, q, subject, type, status, when, now]);

  const sel = items.find((a) => a.id === selected) ?? null;
  const showStatus = role === 'student' || role === 'parent';

  return (
    <>
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input py-1.5 pl-8" placeholder="Søk …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Søk" />
        </div>
        <Select label="Tidsrom" value={when} onChange={(v) => setWhen(v as typeof when)}
          options={[{ value: 'kommende', label: 'Kommende' }, { value: 'tidligere', label: 'Tidligere' }, { value: 'alle', label: 'Alle' }]} />
        <Select label="Fag" value={subject} onChange={setSubject}
          options={[{ value: 'alle', label: 'Alle fag' }, ...subjects.map((s) => ({ value: s.id, label: s.name + (s.className ? ` (${s.className})` : '') }))]} />
        {types.length > 1 && <Select label="Type" value={type} onChange={setType}
          options={[{ value: 'alle', label: 'Alle typer' }, ...types.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />}
        {showStatus && <Select label="Status" value={status} onChange={setStatus}
          options={[{ value: 'alle', label: 'Alle statuser' }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label }))]} />}
        {role !== 'parent' && <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> {createLabel}</button>}
      </div>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <EmptyState title="Ingen treff" text="Prøv andre filtre eller et annet tidsrom." /> : (
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line"><tr>
              <th className="table-th">Tittel</th><th className="table-th">Fag</th><th className="table-th">Type</th>
              <th className="table-th">Frist</th>{showStatus && <th className="table-th">Status</th>}<th className="table-th">Kilde</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer transition hover:bg-ink/[.03]" onClick={() => setSelected(a.id)}>
                  <td className="table-td font-medium">
                    <button className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}>{a.title}</button>
                  </td>
                  <td className="table-td text-muted">{a.subjectName ?? 'Personlig'}</td>
                  <td className="table-td"><TypeBadge type={a.activityType} /></td>
                  <td className="table-td whitespace-nowrap">{fmtDateTime(a.date)}<div className="text-xs text-muted">{relativeDays(a.date)}</div></td>
                  {showStatus && <td className="table-td"><StatusBadge status={a.status} /></td>}
                  <td className="table-td text-xs text-muted">{PLATFORM_LABEL[a.sourcePlatform]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={!!sel} onClose={() => setSelected(null)} title={sel?.title ?? ''}>
        {sel && <ActivityDetail a={sel} role={role} canManage={!!sel.subjectId && managed.includes(sel.subjectId)}
          onChanged={(m, ok, close) => { toast(m, ok ? 'ok' : 'err'); if (close) setSelected(null); }} />}
      </Drawer>
      <CreateActivityModal open={createOpen} onClose={() => setCreateOpen(false)} role={role}
        subjects={role === 'teacher' ? subjects.filter((s) => managed.includes(s.id)) : subjects}
        onDone={(m, ok) => toast(m, ok ? 'ok' : 'err')} />
      {toastNode}
    </>
  );
}
