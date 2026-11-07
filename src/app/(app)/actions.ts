'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { CHILD_COOKIE, getSession } from '@/lib/session';
import { parseNorwegianDate } from '@/integrations/connectors/csv';

/**
 * Server actions. Alle skriver med brukerens egen Supabase-klient,
 * slik at Row Level Security avgjør hva som er lov – ikke frontend.
 */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const ASSIGNMENT_TYPES = ['innlevering', 'oppgave', 'lekse', 'prosjekt', 'presentasjon', 'frist', 'annet'];
const STATUSES = ['ikke_startet', 'pagar', 'levert', 'fullfort'];

function fail(error: unknown): ActionResult {
  const msg = typeof error === 'object' && error && 'message' in error ? String((error as { message: string }).message) : String(error);
  if (/row-level security|permission denied/i.test(msg)) return { ok: false, error: 'Du har ikke tilgang til å gjøre dette.' };
  return { ok: false, error: msg };
}

/** Dato/tid fra skjema tolkes alltid som norsk tid (uavhengig av serverens tidssone) */
const toIso = (date: string, time: string | null) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ugyldig dato');
  const iso = parseNorwegianDate(`${date} ${time && /^\d{2}:\d{2}$/.test(time) ? time : '23:59'}`);
  if (!iso) throw new Error('Ugyldig dato');
  return iso;
};

export async function createActivity(input: {
  title: string; description?: string; activityType: string; subjectId?: string | null; date: string; time?: string | null;
  startDate?: string | null;
}): Promise<ActionResult> {
  try {
    const s = await getSession();
    const supabase = await createClient();
    const title = input.title?.trim();
    if (!title || title.length > 300) return { ok: false, error: 'Tittel må være 1–300 tegn' };
    const due = toIso(input.date, input.time ?? null);
    const isTest = input.activityType === 'prove' || input.activityType === 'eksamen';

    if (s.role === 'student' || s.role === 'parent') {
      if (s.role === 'parent') return { ok: false, error: 'Foresatte kan ikke opprette aktiviteter' };
      if (isTest) return { ok: false, error: 'Prøver registreres av lærer. Velg en annen type for egne aktiviteter.' };
      const { data, error } = await supabase.from('assignments').insert({
        school_id: s.schoolId, subject_id: input.subjectId || null, student_id: s.studentId, title,
        description: input.description || null, activity_type: ASSIGNMENT_TYPES.includes(input.activityType) ? input.activityType : 'annet',
        due_at: due, starts_at: input.startDate ? toIso(input.startDate, '08:00') : null, created_by: s.userId,
      }).select('id').single();
      if (error) return fail(error);
      revalidatePath('/', 'layout');
      return { ok: true, id: data.id };
    }

    if (!input.subjectId) return { ok: false, error: 'Velg fag' };
    if (isTest) {
      const { data, error } = await supabase.from('tests').insert({
        school_id: s.schoolId, subject_id: input.subjectId, title, description: input.description || null,
        test_type: input.activityType, test_date: toIso(input.date, input.time || '08:30'), created_by: s.userId,
      }).select('id').single();
      if (error) return fail(error);
      revalidatePath('/', 'layout');
      return { ok: true, id: data.id };
    }
    if (!ASSIGNMENT_TYPES.includes(input.activityType)) return { ok: false, error: 'Ugyldig aktivitetstype' };
    const { data, error } = await supabase.from('assignments').insert({
      school_id: s.schoolId, subject_id: input.subjectId, title, description: input.description || null,
      activity_type: input.activityType, due_at: due, starts_at: input.startDate ? toIso(input.startDate, '08:00') : null,
      created_by: s.userId,
    }).select('id').single();
    if (error) return fail(error);
    revalidatePath('/', 'layout');
    return { ok: true, id: data.id };
  } catch (e) { return fail(e); }
}

export async function deleteActivity(id: string, kind: 'assignment' | 'test'): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase.from(kind === 'test' ? 'tests' : 'assignments').delete({ count: 'exact' }).eq('id', id);
  if (error) return fail(error);
  if (!count) return { ok: false, error: 'Du har ikke tilgang til å slette denne aktiviteten.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Elev setter egen status (Ikke startet / Pågår / Levert) */
export async function setMyStatus(assignmentId: string, status: string): Promise<ActionResult> {
  const s = await getSession();
  if (s.role !== 'student' || !s.studentId) return { ok: false, error: 'Kun elever kan endre egen status' };
  if (!STATUSES.includes(status) || status === 'fullfort') return { ok: false, error: 'Ugyldig status' };
  const supabase = await createClient();
  const { error } = await supabase.from('submissions').upsert({
    student_id: s.studentId, assignment_id: assignmentId, status,
    submitted_at: status === 'levert' ? new Date().toISOString() : null,
  }, { onConflict: 'student_id,assignment_id' });
  if (error) return fail(error);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Lærer vurderer innlevering */
export async function gradeSubmission(input: { id: string; grade: string; assessment: string; status: string }): Promise<ActionResult> {
  if (!STATUSES.includes(input.status)) return { ok: false, error: 'Ugyldig status' };
  if (input.grade && !/^([1-6]|IV|Godkjent|Ikke godkjent)$/.test(input.grade)) return { ok: false, error: 'Karakter må være 1–6, IV eller Godkjent/Ikke godkjent' };
  const supabase = await createClient();
  const { error, count } = await supabase.from('submissions')
    .update({ grade: input.grade || null, assessment: input.assessment || null, status: input.status }, { count: 'exact' })
    .eq('id', input.id);
  if (error) return fail(error);
  if (!count) return { ok: false, error: 'Du har ikke tilgang til denne innleveringen.' };
  revalidatePath('/innleveringer');
  return { ok: true };
}

export async function createAbsence(input: {
  studentId: string; subjectId?: string | null; date: string; fromTime: string; toTime: string; absenceType: string;
}): Promise<ActionResult> {
  const s = await getSession();
  if (s.role !== 'teacher' && s.role !== 'admin') return { ok: false, error: 'Fravær registreres av lærer eller administrator' };
  const [fh, fm] = input.fromTime.split(':').map(Number), [th, tm] = input.toTime.split(':').map(Number);
  const hours = Math.round(((th * 60 + tm) - (fh * 60 + fm)) / 15) / 4;
  if (!(hours > 0 && hours <= 12)) return { ok: false, error: 'Til-tid må være etter fra-tid' };
  const supabase = await createClient();
  const { error } = await supabase.from('absences').insert({
    student_id: input.studentId, school_id: s.schoolId, subject_id: input.subjectId || null, date: input.date,
    from_time: input.fromTime, to_time: input.toTime, hours, absence_type: input.absenceType,
    documentation_status: input.absenceType === 'skoleaktivitet' ? 'godkjent' : 'ikke_dokumentert',
  });
  if (error) return fail(error);
  revalidatePath('/fravaer');
  return { ok: true };
}

/** Administrator godkjenner/avviser dokumentasjon. Koblet fravær oppdateres. */
export async function reviewDocument(id: string, status: 'godkjent' | 'avvist'): Promise<ActionResult> {
  const s = await getSession();
  if (s.role !== 'admin') return { ok: false, error: 'Kun administrator' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('documents').update({ documentation_status: status }).eq('id', id)
    .select('absence_id').single();
  if (error) return fail(error);
  if (data?.absence_id) await supabase.from('absences').update({ documentation_status: status }).eq('id', data.absence_id);
  revalidatePath('/dokumentasjon');
  revalidatePath('/fravaer');
  return { ok: true };
}

export async function updateUserRole(userId: string, role: string): Promise<ActionResult> {
  const s = await getSession();
  if (s.role !== 'admin') return { ok: false, error: 'Kun administrator' };
  if (!['student', 'teacher', 'admin', 'parent'].includes(role)) return { ok: false, error: 'Ugyldig rolle' };
  if (userId === s.userId) return { ok: false, error: 'Du kan ikke endre din egen rolle' };
  const supabase = await createClient();
  const { error, count } = await supabase.from('profiles').update({ role }, { count: 'exact' }).eq('id', userId);
  if (error) return fail(error);
  if (!count) return { ok: false, error: 'Fant ikke brukeren på din skole' };
  revalidatePath('/innstillinger');
  return { ok: true };
}

export async function saveIntegrationConfig(platform: string, configJson: string, enabled: boolean): Promise<ActionResult> {
  const s = await getSession();
  if (s.role !== 'admin') return { ok: false, error: 'Kun administrator' };
  let config: unknown;
  try { config = JSON.parse(configJson || '{}'); } catch { return { ok: false, error: 'Konfig må være gyldig JSON' }; }
  if (/secret|password|token/i.test(configJson)) return { ok: false, error: 'Hemmeligheter skal ligge i servermiljøet, ikke i konfig' };
  const supabase = await createClient();
  const { error } = await supabase.from('integrations')
    .update({ config, ...(enabled ? {} : { status: 'deaktivert' }) }).eq('platform', platform).eq('school_id', s.schoolId);
  if (error) return fail(error);
  if (enabled) await supabase.from('integrations').update({ status: platform === 'mock' ? 'testmodus' : platform === 'csv' ? 'tilkoblet' : 'ikke_tilkoblet' })
    .eq('platform', platform).eq('school_id', s.schoolId).eq('status', 'deaktivert');
  revalidatePath('/integrasjoner');
  return { ok: true };
}

export async function selectChild(childId: string) {
  (await cookies()).set(CHILD_COOKIE, childId, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
  revalidatePath('/', 'layout');
}

export async function updateMyName(fullName: string): Promise<ActionResult> {
  const s = await getSession();
  const name = fullName.trim();
  if (name.length < 2 || name.length > 100) return { ok: false, error: 'Navn må være 2–100 tegn' };
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', s.userId);
  if (error) return fail(error);
  revalidatePath('/', 'layout');
  return { ok: true };
}
