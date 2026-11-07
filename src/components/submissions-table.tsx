'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { gradeSubmission } from '@/app/(app)/actions';
import { fmtDateTime } from '@/lib/format';
import { STATUS_META, type WorkStatus } from '@/lib/meta';
import { EmptyState, Modal, Select, StatusBadge, useToast } from './ui';

export interface SubmissionRow {
  id: string; status: WorkStatus; submittedAt: string | null; grade: string | null; assessment: string | null;
  studentName: string; title: string; dueAt: string; subjectName: string;
}

export function SubmissionsTable({ rows, staff }: { rows: SubmissionRow[]; staff: boolean }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('alle');
  const [subject, setSubject] = useState('alle');
  const [edit, setEdit] = useState<SubmissionRow | null>(null);
  const [pending, start] = useTransition();
  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subjectName))].sort(), [rows]);
  const list = rows.filter((r) => (status === 'alle' || r.status === status) && (subject === 'alle' || r.subjectName === subject)
    && (!q || `${r.title} ${r.studentName}`.toLowerCase().includes(q.toLowerCase())));

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await gradeSubmission({ id: edit.id, grade: String(f.get('grade') ?? ''), assessment: String(f.get('assessment') ?? ''), status: String(f.get('status')) });
      toast(r.ok ? 'Vurdering lagret' : r.error, r.ok ? 'ok' : 'err');
      if (r.ok) { setEdit(null); router.refresh(); }
    });
  }

  return (
    <>
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input py-1.5 pl-8" placeholder={staff ? 'Søk på oppgave eller elev …' : 'Søk …'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Søk" />
        </div>
        <Select label="Fag" value={subject} onChange={setSubject} options={[{ value: 'alle', label: 'Alle fag' }, ...subjects.map((s) => ({ value: s, label: s }))]} />
        <Select label="Status" value={status} onChange={setStatus}
          options={[{ value: 'alle', label: 'Alle statuser' }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label }))]} />
      </div>
      <div className="card overflow-x-auto">
        {list.length === 0 ? <EmptyState title="Ingen innleveringer" text="Innleveringer vises når en elev har startet eller levert." /> : (
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line"><tr>
              {staff && <th className="table-th">Elev</th>}
              <th className="table-th">Oppgave</th><th className="table-th">Frist</th><th className="table-th">Levert</th>
              <th className="table-th">Status</th><th className="table-th">Karakter</th>{staff && <th className="table-th" />}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {list.slice(0, 400).map((r) => {
                const late = r.submittedAt && Date.parse(r.submittedAt) > Date.parse(r.dueAt);
                return (
                  <tr key={r.id} className="hover:bg-ink/[.03]">
                    {staff && <td className="table-td font-medium">{r.studentName}</td>}
                    <td className="table-td"><div className="font-medium">{r.title}</div><div className="text-xs text-muted">{r.subjectName}</div>
                      {!staff && r.assessment && <div className="mt-1 text-xs italic text-muted">«{r.assessment}»</div>}</td>
                    <td className="table-td whitespace-nowrap text-muted">{fmtDateTime(r.dueAt)}</td>
                    <td className="table-td whitespace-nowrap">{r.submittedAt ? fmtDateTime(r.submittedAt) : '–'}
                      {late && <div className="text-xs text-amber-600">Etter frist</div>}</td>
                    <td className="table-td"><StatusBadge status={r.status} /></td>
                    <td className="table-td font-semibold tabular-nums">{r.grade ?? '–'}</td>
                    {staff && <td className="table-td text-right"><button className="btn-outline px-2.5 py-1 text-xs" onClick={() => setEdit(r)}>Vurder</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {list.length > 400 && <div className="border-t border-line px-4 py-2 text-xs text-muted">Viser 400 av {list.length}. Bruk filtrene for å avgrense.</div>}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Vurder: ${edit?.studentName ?? ''}`}>
        {edit && (
          <form onSubmit={save} className="space-y-3">
            <p className="text-sm text-muted">{edit.title} · {edit.subjectName}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="g-status">Status</label>
                <select id="g-status" name="status" className="input" defaultValue={edit.status === 'levert' ? 'fullfort' : edit.status}>
                  {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select></div>
              <div><label className="label" htmlFor="g-grade">Karakter</label>
                <input id="g-grade" name="grade" className="input" defaultValue={edit.grade ?? ''} placeholder="1–6, IV, Godkjent" /></div>
            </div>
            <div><label className="label" htmlFor="g-ass">Vurdering / tilbakemelding</label>
              <textarea id="g-ass" name="assessment" rows={4} className="input" defaultValue={edit.assessment ?? ''} /></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Avbryt</button>
              <button className="btn-primary" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}Lagre</button></div>
          </form>
        )}
      </Modal>
      {toastNode}
    </>
  );
}
