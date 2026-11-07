import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityType, WorkStatus } from './meta';
import { linkEnv, type LinkPlatform, type OpenLink } from './links';
import { openFor } from './open-link';
import type { SessionContext } from './session';

export interface ActivityItem {
  id: string;
  kind: 'assignment' | 'test';
  activityType: ActivityType;
  title: string;
  description: string | null;
  startsAt: string;
  date: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
  status: WorkStatus;
  sourcePlatform: string;
  personal: boolean;
  grade?: string | null;
  /** Når eleven leverte (innleveringens tidspunkt) */
  submittedAt?: string | null;
  /** Original lenke i kildesystemet (fra skolens import), og oppgavens ID der */
  sourceUrl: string | null;
  externalId: string | null;
  /** Hvor «Åpne»-knappen går (kildesystemet hvis lenke finnes) */
  open: OpenLink | null;
}

/**
 * Henter alle aktiviteter brukeren har lov til å se (RLS) og slår opp
 * elevens egen status fra innleveringer/prøveresultater.
 */
export async function loadActivities(supabase: SupabaseClient, s: SessionContext): Promise<ActivityItem[]> {
  const { data: acts, error } = await supabase.from('activities').select('*').order('date');
  if (error) throw new Error(`Kunne ikke hente aktiviteter: ${error.message}`);

  const subStatus = new Map<string, { status: WorkStatus; grade: string | null; submittedAt?: string | null }>();
  if (s.studentId) {
    const [{ data: subs }, { data: res }] = await Promise.all([
      supabase.from('submissions').select('assignment_id, status, grade, submitted_at, updated_at').eq('student_id', s.studentId),
      supabase.from('test_results').select('test_id, status, result').eq('student_id', s.studentId),
    ]);
    subs?.forEach((x) => subStatus.set(x.assignment_id, { status: x.status, grade: x.grade,
      submittedAt: x.submitted_at ?? (x.status === 'levert' || x.status === 'fullfort' ? x.updated_at : null) }));
    res?.forEach((x) => subStatus.set(x.test_id, { status: x.status, grade: x.result }));
  }

  return (acts ?? [])
    // foresatt med flere barn: vis kun valgt barns personlige aktiviteter
    .filter((a) => !a.personal_student_id || a.personal_student_id === s.studentId)
    .map((a) => {
      const own = subStatus.get(a.id);
      return {
        id: a.id, kind: a.kind, activityType: a.activity_type, title: a.title, description: a.description,
        startsAt: a.starts_at, date: a.date, subjectId: a.subject_id, subjectName: a.subject_name,
        subjectCode: a.subject_code, teacherName: a.teacher_name,
        status: (own?.status ?? (s.studentId ? 'ikke_startet' : a.default_status)) as WorkStatus,
        grade: own?.grade ?? null, submittedAt: own?.submittedAt ?? null, sourcePlatform: a.source_platform, personal: !!a.personal_student_id,
        sourceUrl: a.source_url ?? null, externalId: a.external_id ?? null,
        open: a.source_url
          ? openFor([{ url: a.source_url, platform: (['canvas', 'teams', 'iskole', 'itslearning'].includes(a.source_platform) ? a.source_platform : 'skolehub') as LinkPlatform,
              linkKind: 'direkte' }], a.kind === 'test', linkEnv())
          : null,
      };
    });
}

export interface AbsenceRow {
  id: string; date: string; from_time: string | null; to_time: string | null; absence_type: string;
  hours: number; documentation_status: string; subject_id: string | null; student_id: string; source_platform: string;
  subjects: { name: string } | null; students: { full_name: string } | null;
}

export async function loadAbsences(supabase: SupabaseClient, s: SessionContext) {
  let q = supabase.from('absences')
    .select('id, date, from_time, to_time, absence_type, hours, documentation_status, subject_id, student_id, source_platform, subjects(name), students(full_name)')
    .order('date', { ascending: false });
  if (s.studentId) q = q.eq('student_id', s.studentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AbsenceRow[];
}

export function summarizeAbsence(rows: AbsenceRow[]) {
  const total = rows.reduce((n, r) => n + Number(r.hours), 0);
  const documented = rows.filter((r) => r.documentation_status === 'godkjent').reduce((n, r) => n + Number(r.hours), 0);
  const bySubject = new Map<string, number>();
  const byMonth = new Map<string, { documented: number; undocumented: number }>();
  for (const r of rows) {
    const subj = r.subjects?.name ?? 'Uten fag';
    bySubject.set(subj, (bySubject.get(subj) ?? 0) + Number(r.hours));
    const m = r.date.slice(0, 7);
    const cur = byMonth.get(m) ?? { documented: 0, undocumented: 0 };
    if (r.documentation_status === 'godkjent') cur.documented += Number(r.hours); else cur.undocumented += Number(r.hours);
    byMonth.set(m, cur);
  }
  return {
    total, documented, undocumented: total - documented,
    bySubject: [...bySubject].map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours),
    byMonth: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
  };
}
