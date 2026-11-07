import type { SupabaseClient } from '@supabase/supabase-js';
import { subjectKey, type AbsenceRow, type ActivityRow, type ExistingActivity, type SyncStore, type SyncSummary } from './sync-engine';
import type { Platform } from './types';

/**
 * Lagring av synkroniserte data i Supabase/PostgreSQL.
 * Brukes med service role-klient ETTER at API-ruten har bekreftet at
 * brukeren er administrator på skolen. Alle skrivinger er låst til schoolId.
 */
export class SupabaseSyncStore implements SyncStore {
  constructor(private db: SupabaseClient) {}

  async subjectLookup(schoolId: string) {
    const { data, error } = await this.db.from('subjects').select('id, code, name').eq('school_id', schoolId);
    if (error) throw error;
    const m = new Map<string, string>();
    for (const s of data ?? []) { m.set(subjectKey(s.code), s.id); if (!m.has(subjectKey(s.name))) m.set(subjectKey(s.name), s.id); }
    return m;
  }

  async existingActivities(schoolId: string, platform: Platform, kind: 'assignment' | 'test', ids: string[]) {
    const out = new Map<string, ExistingActivity>();
    for (const chunk of chunks(ids, 200)) {
      if (kind === 'assignment') {
        const { data, error } = await this.db.from('assignments')
          .select('id, external_id, title, description, due_at, starts_at, activity_type, subject_id, source_url')
          .eq('school_id', schoolId).eq('source_platform', platform).in('external_id', chunk);
        if (error) throw error;
        data?.forEach((r) => out.set(r.external_id, { id: r.id, title: r.title, description: r.description, dueAt: r.due_at,
          startsAt: r.starts_at, activityType: r.activity_type, subjectId: r.subject_id, url: r.source_url }));
      } else {
        const { data, error } = await this.db.from('tests')
          .select('id, external_id, title, description, test_date, test_type, subject_id, source_url')
          .eq('school_id', schoolId).eq('source_platform', platform).in('external_id', chunk);
        if (error) throw error;
        data?.forEach((r) => out.set(r.external_id, { id: r.id, title: r.title, description: r.description, dueAt: r.test_date,
          startsAt: null, activityType: r.test_type, subjectId: r.subject_id, url: r.source_url }));
      }
    }
    return out;
  }

  async upsertActivities(kind: 'assignment' | 'test', rows: ActivityRow[]) {
    if (kind === 'assignment') {
      const { error } = await this.db.from('assignments').upsert(rows.map((r) => ({
        school_id: r.schoolId, subject_id: r.subjectId, title: r.activity.title, description: r.activity.description ?? null,
        activity_type: r.activity.activityType, starts_at: r.activity.startsAt ?? null, due_at: r.activity.dueAt,
        source_platform: r.platform, external_id: r.activity.externalId,
        source_url: r.activity.url ?? null, source_course_id: r.activity.courseExternalId ?? null,
      })), { onConflict: 'school_id,source_platform,external_id' });
      if (error) throw error;
    } else {
      const { error } = await this.db.from('tests').upsert(rows.map((r) => ({
        school_id: r.schoolId, subject_id: r.subjectId, title: r.activity.title, description: r.activity.description ?? null,
        test_type: r.activity.activityType === 'eksamen' ? 'eksamen' : 'prove', test_date: r.activity.dueAt,
        source_platform: r.platform, external_id: r.activity.externalId,
        source_url: r.activity.url ?? null, source_course_id: r.activity.courseExternalId ?? null,
      })), { onConflict: 'school_id,source_platform,external_id' });
      if (error) throw error;
    }
  }

  async studentLookup(schoolId: string, emails: string[]) {
    const m = new Map<string, string>();
    for (const chunk of chunks(emails, 200)) {
      const { data, error } = await this.db.from('students').select('id, email').eq('school_id', schoolId).in('email', chunk);
      if (error) throw error;
      data?.forEach((s) => s.email && m.set(s.email.toLowerCase(), s.id));
    }
    return m;
  }

  async existingAbsenceIds(schoolId: string, platform: Platform, ids: string[]) {
    const set = new Set<string>();
    for (const chunk of chunks(ids, 200)) {
      const { data, error } = await this.db.from('absences').select('external_id')
        .eq('school_id', schoolId).eq('source_platform', platform).in('external_id', chunk);
      if (error) throw error;
      data?.forEach((r) => set.add(r.external_id));
    }
    return set;
  }

  async upsertAbsences(rows: AbsenceRow[]) {
    const { error } = await this.db.from('absences').upsert(rows.map((r) => ({
      student_id: r.studentId, school_id: r.schoolId, subject_id: r.subjectId, date: r.absence.date,
      from_time: r.absence.fromTime, to_time: r.absence.toTime, hours: r.absence.hours,
      absence_type: r.absence.absenceType,
      documentation_status: r.absence.documented ? 'godkjent' : 'ikke_dokumentert',
      source_platform: r.platform, external_id: r.absence.externalId,
    })), { onConflict: 'school_id,source_platform,external_id' });
    if (error) throw error;
  }

  async startRun(integrationId: string, schoolId: string, triggeredBy: string | null) {
    const { data, error } = await this.db.from('sync_runs')
      .insert({ integration_id: integrationId, school_id: schoolId, triggered_by: triggeredBy }).select('id').single();
    if (error) throw error;
    return data.id as string;
  }

  async finishRun(runId: string, integrationId: string, s: SyncSummary) {
    await this.db.from('sync_runs').update({
      finished_at: new Date().toISOString(), status: s.status, created_count: s.created, updated_count: s.updated,
      skipped_count: s.skipped, error_count: s.errorCount,
      log: [...s.log, ...s.errors.slice(0, 200).map((e) => ({ level: 'error', message: `${e.row ? `[${e.row}] ` : ''}${e.message}` }))],
    }).eq('id', runId);
    await this.db.from('integrations').update({
      status: s.integrationStatus,
      last_error: s.status === 'vellykket' ? null : s.message,
      ...(s.status !== 'feilet' ? { last_synced_at: new Date().toISOString() } : {}),
    }).eq('id', integrationId);
  }
}

function* chunks<T>(arr: T[], n: number) { for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n); }
