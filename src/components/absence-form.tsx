'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { createAbsence } from '@/app/(app)/actions';
import { ABSENCE_LABEL } from '@/lib/meta';
import { Modal, useToast } from './ui';

export function RegisterAbsence({ students, subjects }: {
  students: { id: string; full_name: string; className: string | null }[]; subjects: { id: string; name: string; className: string | null }[];
}) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await createAbsence({
        studentId: String(f.get('student')), subjectId: String(f.get('subject') || '') || null, date: String(f.get('date')),
        fromTime: String(f.get('from')), toTime: String(f.get('to')), absenceType: String(f.get('type')),
      });
      if (!r.ok) return setError(r.error);
      toast('Fravær registrert');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Registrer fravær</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrer fravær">
        <form onSubmit={submit} className="space-y-3">
          <div><label className="label" htmlFor="ab-st">Elev</label>
            <select id="ab-st" name="student" required className="input">
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.className ? ` (${s.className})` : ''}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ab-su">Fag</label>
            <select id="ab-su" name="subject" className="input"><option value="">Hele dagen / uten fag</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.className ? ` (${s.className})` : ''}</option>)}
            </select></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label" htmlFor="ab-d">Dato</label><input id="ab-d" name="date" type="date" required max={today} defaultValue={today} className="input" /></div>
            <div><label className="label" htmlFor="ab-f">Fra</label><input id="ab-f" name="from" type="time" required defaultValue="08:15" className="input" /></div>
            <div><label className="label" htmlFor="ab-t">Til</label><input id="ab-t" name="to" type="time" required defaultValue="09:45" className="input" /></div>
          </div>
          <div><label className="label" htmlFor="ab-ty">Fraværstype</label>
            <select id="ab-ty" name="type" className="input" defaultValue="udokumentert">
              {Object.entries(ABSENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <p className="text-xs text-muted">Registrer bare det som er nødvendig. Årsak/diagnose skal ikke skrives inn.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Avbryt</button>
            <button className="btn-primary" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}Lagre</button></div>
        </form>
      </Modal>
      {toastNode}
    </>
  );
}
