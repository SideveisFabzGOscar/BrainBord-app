'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Trash2, UserPlus } from 'lucide-react';
import { updateMyName, updateUserRole } from '@/app/(app)/actions';
import { fmtDateTime } from '@/lib/format';
import { ROLE_LABEL, type Role } from '@/lib/meta';
import { Modal, useToast } from './ui';

export function ProfileForm({ fullName, email }: { fullName: string; email: string | null }) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const name = String(new FormData(e.currentTarget).get('name'));
      start(async () => { const r = await updateMyName(name); toast(r.ok ? 'Lagret' : r.error, r.ok ? 'ok' : 'err'); if (r.ok) router.refresh(); });
    }}>
      <div><label className="label" htmlFor="p-name">Navn</label><input id="p-name" name="name" className="input" defaultValue={fullName} /></div>
      <div><label className="label" htmlFor="p-mail">E-post</label><input id="p-mail" className="input" value={email ?? ''} disabled /></div>
      <button className="btn-primary" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}Lagre</button>
      {toastNode}
    </form>
  );
}

export function GdprExport({ studentId, label }: { studentId: string; label: string }) {
  return <a className="btn-outline" href={`/api/gdpr/export?student=${studentId}`}><Download size={15} /> {label}</a>;
}

export function UserAdmin({ users, me, classes, students }: {
  users: { id: string; full_name: string; email: string | null; role: Role }[]; me: string;
  classes: { id: string; name: string }[]; students: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const { toast, toastNode } = useToast();
  const [pending, start] = useTransition();
  const [invite, setInvite] = useState(false);
  const [erase, setErase] = useState<string>('');
  const [confirmText, setConfirmText] = useState('');

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-outline" onClick={() => setInvite(true)}><UserPlus size={15} /> Inviter bruker</button></div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[520px]">
          <thead className="border-b border-line"><tr><th className="table-th">Navn</th><th className="table-th">E-post</th><th className="table-th">Rolle</th></tr></thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="table-td font-medium">{u.full_name}</td>
                <td className="table-td text-muted">{u.email}</td>
                <td className="table-td">
                  <select aria-label={`Rolle for ${u.full_name}`} className="input w-auto py-1" defaultValue={u.role} disabled={u.id === me || pending}
                    onChange={(e) => start(async () => { const r = await updateUserRole(u.id, e.target.value); toast(r.ok ? 'Rolle oppdatert' : r.error, r.ok ? 'ok' : 'err'); router.refresh(); })}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-red-500/30 p-4">
        <div className="font-medium text-red-600">Slett elev og alle personopplysninger (GDPR art. 17)</div>
        <p className="mt-1 text-sm text-muted">Sletter eleven, innleveringer, fravær, dokumenter og filer permanent. Handlingen logges og kan ikke angres.
          Sjekk arkivplikt før sletting.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select aria-label="Velg elev" className="input w-auto" value={erase} onChange={(e) => setErase(e.target.value)}>
            <option value="">Velg elev …</option>{students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <input className="input w-36" placeholder='Skriv "SLETT"' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Bekreftelse" />
          <button className="btn-outline text-red-600" disabled={!erase || confirmText !== 'SLETT' || pending}
            onClick={() => start(async () => {
              const res = await fetch('/api/gdpr/erase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: erase, confirm: 'SLETT' }) });
              const j = await res.json();
              toast(res.ok ? `Slettet (${j.deletedFiles} filer)` : j.error, res.ok ? 'ok' : 'err');
              setErase(''); setConfirmText(''); router.refresh();
            })}><Trash2 size={15} /> Slett permanent</button>
        </div>
      </div>

      <Modal open={invite} onClose={() => setInvite(false)} title="Inviter bruker">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: f.get('email'), fullName: f.get('name'), role: f.get('role'), classId: f.get('class') || null }) });
            const j = await res.json();
            toast(res.ok ? 'Invitasjon sendt' : j.error, res.ok ? 'ok' : 'err');
            if (res.ok) { setInvite(false); router.refresh(); }
          });
        }}>
          <div><label className="label" htmlFor="i-name">Navn</label><input id="i-name" name="name" required className="input" /></div>
          <div><label className="label" htmlFor="i-mail">E-post</label><input id="i-mail" name="email" type="email" required className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="i-role">Rolle</label><select id="i-role" name="role" className="input">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            <div><label className="label" htmlFor="i-class">Klasse (elever)</label><select id="i-class" name="class" className="input">
              <option value="">–</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <p className="text-xs text-muted">Foresatte får tilgang først når administrator har registrert og verifisert behandlingsgrunnlag (foreldreansvar/samtykke).</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setInvite(false)}>Avbryt</button>
            <button className="btn-primary" disabled={pending}>Send invitasjon</button></div>
        </form>
      </Modal>
      {toastNode}
    </>
  );
}

export function AuditLog({ rows }: { rows: { id: number; at: string; action: string; table_name: string; actor: string | null }[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b border-line bg-panel"><tr><th className="table-th">Tid</th><th className="table-th">Hvem</th><th className="table-th">Handling</th><th className="table-th">Tabell</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}><td className="table-td whitespace-nowrap text-muted">{fmtDateTime(r.at)}</td><td className="table-td">{r.actor ?? 'System'}</td>
              <td className="table-td"><code className="text-xs">{r.action}</code></td><td className="table-td text-muted">{r.table_name}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
