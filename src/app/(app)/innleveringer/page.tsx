import { PageHeader, StatCard } from '@/components/ui';
import { SubmissionsTable, type SubmissionRow } from '@/components/submissions-table';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Innleveringer' };

export default async function InnleveringerPage() {
  const s = await getSession();
  const supabase = await createClient();
  const staff = s.role === 'teacher' || s.role === 'admin';
  let q = supabase.from('submissions')
    .select('id, status, submitted_at, grade, assessment, students(full_name), assignments!inner(title, due_at, subjects(name))')
    .limit(2000);
  if (s.studentId) q = q.eq('student_id', s.studentId);
  // Lærere: RLS begrenser automatisk til innleveringer i fag de underviser
  const { data } = await q;

  type Raw = { id: string; status: SubmissionRow['status']; submitted_at: string | null; grade: string | null; assessment: string | null;
    students: { full_name: string } | null; assignments: { title: string; due_at: string; subjects: { name: string } | null } };
  const rows: SubmissionRow[] = ((data ?? []) as unknown as Raw[])
    .filter((r) => r.assignments)
    .map((r) => ({
      id: r.id, status: r.status, submittedAt: r.submitted_at, grade: r.grade, assessment: r.assessment,
      studentName: r.students?.full_name ?? '–', title: r.assignments.title, dueAt: r.assignments.due_at,
      subjectName: r.assignments.subjects?.name ?? 'Personlig',
    }))
    .sort((a, b) => Date.parse(b.dueAt) - Date.parse(a.dueAt));

  const toGrade = rows.filter((r) => r.status === 'levert').length;
  const graded = rows.filter((r) => r.status === 'fullfort').length;
  const late = rows.filter((r) => r.submittedAt && Date.parse(r.submittedAt) > Date.parse(r.dueAt)).length;
  return (
    <>
      <PageHeader title="Innleveringer" description={staff ? 'Innleveringer i fagene dine. Vurder og sett karakter.' : 'Status, vurdering og karakter på innleveringene dine.'} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Totalt" value={rows.length} />
        <StatCard label={staff ? 'Venter vurdering' : 'Levert, ikke vurdert'} value={toGrade} tone={toGrade ? 'warn' : 'default'} />
        <StatCard label="Vurdert" value={graded} tone="good" />
        <StatCard label="Levert etter frist" value={late} tone={late ? 'bad' : 'default'} />
      </div>
      <SubmissionsTable rows={rows} staff={staff} />
    </>
  );
}
