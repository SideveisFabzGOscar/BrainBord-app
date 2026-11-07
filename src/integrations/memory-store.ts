import { subjectKey, type AbsenceRow, type ActivityRow, type ExistingActivity, type SyncStore, type SyncSummary } from './sync-engine';
import type { Platform } from './types';

/** Minnebasert SyncStore – brukes i enhetstester. Oppfører seg som DB-ens unike nøkler. */
export class MemoryStore implements SyncStore {
  subjects = new Map<string, string>();      // code/name -> id
  students = new Map<string, string>();      // email -> id
  activities = new Map<string, ExistingActivity & { kind: string; platform: Platform; externalId: string }>();
  absences = new Map<string, AbsenceRow>();
  runs: { id: string; integrationId: string; summary?: SyncSummary }[] = [];
  integrationStatus = new Map<string, string>();
  private seq = 0;

  private key = (school: string, platform: string, ext: string) => `${school}|${platform}|${ext}`;

  async subjectLookup() {
    return new Map([...this.subjects].map(([k, v]) => [subjectKey(k), v]));
  }
  async existingActivities(schoolId: string, platform: Platform, kind: 'assignment' | 'test', ids: string[]) {
    const out = new Map<string, ExistingActivity>();
    for (const id of ids) {
      const a = this.activities.get(this.key(schoolId, platform, id));
      if (a && a.kind === kind) out.set(id, a);
    }
    return out;
  }
  async upsertActivities(kind: 'assignment' | 'test', rows: ActivityRow[]) {
    for (const r of rows) {
      const k = this.key(r.schoolId, r.platform, r.activity.externalId);
      const prev = this.activities.get(k);
      this.activities.set(k, {
        id: prev?.id ?? `a${++this.seq}`, kind, platform: r.platform, externalId: r.activity.externalId,
        title: r.activity.title, description: r.activity.description ?? null, dueAt: r.activity.dueAt,
        startsAt: r.activity.startsAt ?? null, activityType: r.activity.activityType, subjectId: r.subjectId, url: r.activity.url ?? null,
      });
    }
  }
  async studentLookup(_s: string, emails: string[]) {
    return new Map(emails.filter((e) => this.students.has(e)).map((e) => [e, this.students.get(e)!]));
  }
  async existingAbsenceIds(schoolId: string, platform: Platform, ids: string[]) {
    return new Set(ids.filter((id) => this.absences.has(this.key(schoolId, platform, id))));
  }
  async upsertAbsences(rows: AbsenceRow[]) {
    for (const r of rows) this.absences.set(this.key(r.schoolId, r.platform, r.absence.externalId), r);
  }
  async startRun(integrationId: string) {
    const id = `run${this.runs.length + 1}`;
    this.runs.push({ id, integrationId });
    return id;
  }
  async finishRun(runId: string, integrationId: string, summary: SyncSummary) {
    this.runs.find((r) => r.id === runId)!.summary = summary;
    this.integrationStatus.set(integrationId, summary.integrationStatus);
  }
}
