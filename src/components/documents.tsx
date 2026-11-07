'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, Loader2, Upload, X } from 'lucide-react';
import { reviewDocument } from '@/app/(app)/actions';
import { fmtDate } from '@/lib/format';
import { DOC_STATUS_META, DOC_TYPE_LABEL } from '@/lib/meta';
import { Badge, EmptyState, Modal, useToast } from './ui';

export interface DocRow {
  id: string; date: string; documentType: string; status: string; hasFile: boolean; studentName: string; createdAt: string;
}

export function UploadDocument({ studentId, absences }: { studentId: string; absences: { id: string; label: string }[] }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set('studentId', studentId);
    setError(null);
    start(async () => {
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? 'Opplasting feilet');
      toast('Dokumentet er lastet opp kryptert og venter behandling');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Upload size={15} /> Last opp dokumentasjon</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Last opp dokumentasjon">
        <form onSubmit={submit} className="space-y-3">
          <div><label className="label" htmlFor="d-type">Dokumenttype</label>
            <select id="d-type" name="documentType" className="input">
              {Object.entries(DOC_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div><label className="label" htmlFor="d-abs">Gjelder fravær</label>
            <select id="d-abs" name="absenceId" className="input"><option value="">Ikke koblet til et bestemt fravær</option>
              {absences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></div>
          <div><label className="label" htmlFor="d-date">Dato på dokumentet</label>
            <input id="d-date" name="date" type="date" required className="input" defaultValue={new Date().toLocaleDateString('sv-SE')} /></div>
          <div><label className="label" htmlFor="d-file">Fil (PDF, PNG eller JPG, maks 10 MB)</label>
            <input id="d-file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className="input file:mr-3 file:rounded file:border-0 file:bg-ink/5 file:px-2 file:py-1 file:text-sm" /></div>
          <div className="rounded-lg bg-ink/[.04] p-3 text-xs leading-relaxed text-muted">
            Dokumentet krypteres før lagring, og bare du, verifiserte foresatte og skoleadministrasjonen har tilgang. Lærere ser kun at fraværet er dokumentert.
            All åpning logges. Ikke last opp mer helseinformasjon enn skolen trenger – diagnose er ikke nødvendig.
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn-primary" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}Last opp</button></div>
        </form>
      </Modal>
      {toastNode}
    </>
  );
}

export function DocumentsTable({ rows, isAdmin, showStudent }: { rows: DocRow[]; isAdmin: boolean; showStudent: boolean }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [pending, start] = useTransition();
  const review = (id: string, st: 'godkjent' | 'avvist') => start(async () => {
    const r = await reviewDocument(id, st);
    toast(r.ok ? (st === 'godkjent' ? 'Godkjent – fraværet er dokumentert' : 'Avvist') : r.error, r.ok ? 'ok' : 'err');
    if (r.ok) router.refresh();
  });
  if (!rows.length) return <div className="card"><EmptyState title="Ingen dokumentasjon" text="Opplastede egenmeldinger og legeerklæringer vises her." /></div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead className="border-b border-line"><tr>
          {showStudent && <th className="table-th">Elev</th>}<th className="table-th">Dato</th><th className="table-th">Type</th>
          <th className="table-th">Status</th><th className="table-th">Fil</th>{isAdmin && <th className="table-th">Behandling</th>}
        </tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((d) => (
            <tr key={d.id}>
              {showStudent && <td className="table-td font-medium">{d.studentName}</td>}
              <td className="table-td whitespace-nowrap">{fmtDate(d.date)}</td>
              <td className="table-td">{DOC_TYPE_LABEL[d.documentType]}</td>
              <td className="table-td"><Badge className={DOC_STATUS_META[d.status].cls}>{DOC_STATUS_META[d.status].label}</Badge></td>
              <td className="table-td">{d.hasFile
                ? <a className="inline-flex items-center gap-1 text-sm text-accent hover:underline" href={`/api/documents/${d.id}`}><Download size={14} /> Last ned</a>
                : <span className="text-xs text-muted">Registrert uten fil (testdata)</span>}</td>
              {isAdmin && <td className="table-td">{d.status === 'venter' ? (
                <div className="flex gap-1.5">
                  <button className="btn-outline px-2 py-1 text-xs" disabled={pending} onClick={() => review(d.id, 'godkjent')}><Check size={13} /> Godkjenn</button>
                  <button className="btn-outline px-2 py-1 text-xs" disabled={pending} onClick={() => review(d.id, 'avvist')}><X size={13} /> Avvis</button>
                </div>) : <span className="text-xs text-muted">Behandlet</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {toastNode}
    </div>
  );
}
