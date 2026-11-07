import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionContext } from './session';

export interface SubjectRow { id: string; name: string; code: string; className: string | null; teacherId: string | null; teacherName: string | null; classId: string }

/** Fag brukeren kan se (RLS), + hvilke brukeren kan administrere */
export async function loadSubjects(supabase: SupabaseClient, s: SessionContext) {
  const { data } = await supabase.from('subjects')
    .select('id, name, code, class_id, teacher_id, classes(name), profiles:teacher_id(full_name)').order('name');
  let rows: SubjectRow[] = (data ?? []).map((r) => ({
    id: r.id, name: r.name, code: r.code, classId: r.class_id, teacherId: r.teacher_id,
    className: (r.classes as unknown as { name: string } | null)?.name ?? null,
    teacherName: (r.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
  // Foresatt med flere barn: vis bare valgt barns klasse
  if (s.role === 'parent' && s.studentId) {
    const { data: st } = await supabase.from('students').select('class_id').eq('id', s.studentId).single();
    rows = rows.filter((r) => r.classId === st?.class_id);
  }
  const managed = s.role === 'admin' ? rows.map((r) => r.id) : rows.filter((r) => r.teacherId === s.userId).map((r) => r.id);
  return { subjects: rows, managed };
}

export async function currentSchoolYear(supabase: SupabaseClient) {
  const { data } = await supabase.from('school_years').select('label, starts_on, ends_on')
    .eq('is_current', true).limit(1).maybeSingle();
  if (data) return { label: data.label, start: data.starts_on, end: data.ends_on };
  // Fallback: aug–jun rundt dagens dato
  const now = new Date();
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return { label: `${y}/${y + 1}`, start: `${y}-08-15`, end: `${y + 1}-06-20` };
}
