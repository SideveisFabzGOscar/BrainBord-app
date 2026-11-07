import { Lock, ShieldCheck } from 'lucide-react';
import { DocumentsTable, UploadDocument, type DocRow } from '@/components/documents';
import { PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { ABSENCE_LABEL } from '@/lib/meta';
import { getSession, requireRole } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dokumentasjon' };

export default async function DokumentasjonPage() {
  const s = await getSession();
  // Lærere har bevisst ikke tilgang til helsedokumentasjon
  requireRole(s, 'student', 'parent', 'admin');
  const supabase = await createClient();

  let q = supabase.from('documents')
    .select('id, date, document_type, documentation_status, storage_path, created_at, students(full_name)')
    .order('created_at', { ascending: false });
  if (s.studentId) q = q.eq('student_id', s.studentId);
  const { data } = await q;
  const rows: DocRow[] = (data ?? []).map((d) => ({
    id: d.id, date: d.date, documentType: d.document_type, status: d.documentation_status, hasFile: !!d.storage_path,
    createdAt: d.created_at, studentName: (d.students as unknown as { full_name: string } | null)?.full_name ?? '–',
  }));

  let absences: { id: string; label: string }[] = [];
  if (s.studentId) {
    const { data: abs } = await supabase.from('absences').select('id, date, hours, absence_type')
      .eq('student_id', s.studentId).neq('documentation_status', 'godkjent').order('date', { ascending: false }).limit(50);
    absences = (abs ?? []).map((a) => ({ id: a.id, label: `${fmtDate(a.date)} · ${Number(a.hours)} t · ${ABSENCE_LABEL[a.absence_type]}` }));
  }

  return (
    <>
      <PageHeader title="Sykemeldinger og dokumentasjon"
        description="Særlig beskyttede opplysninger. Krypteres, tilgangsbegrenses og tilgangslogges."
        actions={s.studentId && s.role !== 'admin' ? <UploadDocument studentId={s.studentId} absences={absences} /> : undefined} />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          { icon: <Lock size={16} />, t: 'Kryptert lagring', d: 'AES-256-GCM før lagring i privat bucket. Nøkkelen finnes bare på serveren.' },
          { icon: <ShieldCheck size={16} />, t: 'Streng tilgang', d: 'Kun eleven, verifiserte foresatte og skoleadministrasjonen. Ikke lærere.' },
          { icon: <ShieldCheck size={16} />, t: 'Dataminimering', d: 'Ingen diagnose lagres. Dokumenter slettes automatisk etter oppbevaringstiden.' },
        ].map((x) => (
          <div key={x.t} className="card flex gap-3 p-4">
            <div className="mt-0.5 text-accent">{x.icon}</div>
            <div><div className="text-sm font-medium">{x.t}</div><div className="mt-0.5 text-xs leading-relaxed text-muted">{x.d}</div></div>
          </div>
        ))}
      </div>
      <DocumentsTable rows={rows} isAdmin={s.role === 'admin'} showStudent={s.role === 'admin'} />
    </>
  );
}
