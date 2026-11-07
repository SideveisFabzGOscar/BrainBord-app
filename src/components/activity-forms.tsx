'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { createActivity, deleteActivity, setMyStatus } from '@/app/(app)/actions';
import { fmtDateTime } from '@/lib/format';
import { PLATFORM_LABEL, STATUS_META, TYPE_LABEL, type ActivityType, type Role, type WorkStatus } from '@/lib/meta';
import type { ActivityItem } from '@/lib/data';
import { Modal, StatusBadge, TypeBadge } from './ui';

export interface SubjectOption { id: string; name: string; code: string; className?: string | null }

const STUDENT_TYPES: ActivityType[] = ['innlevering', 'oppgave', 'lekse', 'prosjekt', 'presentasjon', 'frist', 'annet'];
const STAFF_TYPES: ActivityType[] = [...STUDENT_TYPES, 'prove', 'eksamen'];

export function CreateActivityModal({ open, onClose, subjects, role, defaultDate, onDone }: {
  open: boolean; onClose: () => void; subjects: SubjectOption[]; role: Role; defaultDate?: string;
  onDone: (msg: string, ok: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const staff = role === 'teacher' || role === 'admin';
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await createActivity({
        title: String(f.get('title')), description: String(f.get('description') ?? ''),
        activityType: String(f.get('type')), subjectId: String(f.get('subject') || '') || null,
        date: String(f.get('date')), time: String(f.get('time') || '') || null,
        startDate: String(f.get('startDate') || '') || null,
      });
      if (!res.ok) return setError(res.error);
      onDone('Aktiviteten er lagt til i årshjulet', true);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={staff ? 'Ny aktivitet' : 'Ny personlig aktivitet'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="ca-title">Tittel</label>
          <input id="ca-title" name="title" required maxLength={300} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ca-type">Type</label>
            <select id="ca-type" name="type" className="input" defaultValue={staff ? 'innlevering' : 'annet'}>
              {(staff ? STAFF_TYPES : STUDENT_TYPES).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ca-subject">Fag {!staff && '(valgfritt)'}</label>
            <select id="ca-subject" name="subject" className="input" required={staff} defaultValue="">
              <option value="">{staff ? 'Velg fag …' : 'Ingen'}</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}{s.className ? ` (${s.className})` : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="ca-date">Frist / dato</label>
            <input id="ca-date" name="date" type="date" required className="input" defaultValue={defaultDate ?? today} />
          </div>
          <div>
            <label className="label" htmlFor="ca-time">Kl.</label>
            <input id="ca-time" name="time" type="time" className="input" defaultValue="23:59" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ca-start">Startdato (valgfritt, for prosjekter)</label>
          <input id="ca-start" name="startDate" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="ca-desc">Beskrivelse</label>
          <textarea id="ca-desc" name="description" rows={3} maxLength={2000} className="input" />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Avbryt</button>
          <button className="btn-primary" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}Lagre</button>
        </div>
      </form>
    </Modal>
  );
}

/** Innholdet i detaljpanelet for én aktivitet */
export function ActivityDetail({ a, role, canManage, onChanged }: {
  a: ActivityItem; role: Role; canManage: boolean; onChanged: (msg: string, ok: boolean, close?: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const studentCanSet = role === 'student' && a.kind === 'assignment';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2"><TypeBadge type={a.activityType} />{role !== 'teacher' && role !== 'admin' && <StatusBadge status={a.status} />}</div>
      <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 text-sm">
        <dt className="text-muted">Fag</dt><dd>{a.subjectName ? `${a.subjectName} (${a.subjectCode})` : 'Personlig aktivitet'}</dd>
        <dt className="text-muted">Lærer</dt><dd>{a.teacherName ?? '–'}</dd>
        <dt className="text-muted">{a.kind === 'test' ? 'Dato' : 'Frist'}</dt><dd>{fmtDateTime(a.date)}</dd>
        {a.startsAt && a.startsAt !== a.date && (<><dt className="text-muted">Start</dt><dd>{fmtDateTime(a.startsAt)}</dd></>)}
        <dt className="text-muted">Kilde</dt><dd>{PLATFORM_LABEL[a.sourcePlatform] ?? a.sourcePlatform}</dd>
        {a.grade && (<><dt className="text-muted">{a.kind === 'test' ? 'Resultat' : 'Karakter'}</dt><dd className="font-semibold">{a.grade}</dd></>)}
      </dl>
      <div>
        <div className="label">Beskrivelse</div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.description || <span className="text-muted">Ingen beskrivelse</span>}</p>
      </div>
      {studentCanSet && (
        <div>
          <div className="label">Min status</div>
          <div className="flex flex-wrap gap-2">
            {(['ikke_startet', 'pagar', 'levert'] as WorkStatus[]).map((st) => (
              <button key={st} disabled={pending || a.status === 'fullfort'}
                className={a.status === st ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-outline px-3 py-1.5 text-xs'}
                onClick={() => start(async () => {
                  const r = await setMyStatus(a.id, st);
                  onChanged(r.ok ? `Status satt til «${STATUS_META[st].label}»` : r.error, r.ok);
                  if (r.ok) router.refresh();
                })}>{STATUS_META[st].label}</button>
            ))}
          </div>
          {a.status === 'fullfort' && <p className="mt-2 text-xs text-muted">Vurdert av lærer – status kan ikke endres.</p>}
          {a.sourcePlatform !== 'manual' && !a.personal && (
            <p className="mt-2 text-xs text-muted">Selve innleveringen gjøres i {PLATFORM_LABEL[a.sourcePlatform]}. Statusen her er din egen oversikt.</p>
          )}
        </div>
      )}
      {(canManage || (a.personal && role === 'student')) && (
        <button className="btn-outline text-red-600" disabled={pending}
          onClick={() => {
            if (!confirm(`Slette «${a.title}»?`)) return;
            start(async () => {
              const r = await deleteActivity(a.id, a.kind);
              onChanged(r.ok ? 'Aktiviteten er slettet' : r.error, r.ok, r.ok);
              if (r.ok) router.refresh();
            });
          }}><Trash2 size={15} /> Slett aktivitet</button>
      )}
    </div>
  );
}
