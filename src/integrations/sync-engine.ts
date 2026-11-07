import { dedupe, validateActivity } from './normalize';
import {
  IntegrationError, type Connector, type ConnectorContext, type LogEntry, type NormalizeResult, type NormalizedAbsence, type NormalizedActivity,
  type Platform, type RowError,
} from './types';

/** Lagringslag – implementeres av Supabase (prod) og minne (tester) */
export interface ExistingActivity {
  id: string; title: string; description: string | null; dueAt: string; startsAt: string | null;
  activityType: string; subjectId: string | null;
}

export interface ActivityRow {
  id?: string; schoolId: string; subjectId: string; platform: Platform; activity: NormalizedActivity;
}
export interface AbsenceRow { schoolId: string; studentId: string; subjectId: string | null; platform: Platform; absence: NormalizedAbsence }

export interface SyncStore {
  subjectLookup(schoolId: string): Promise<Map<string, string>>;
  existingActivities(schoolId: string, platform: Platform, kind: 'assignment' | 'test', externalIds: string[]): Promise<Map<string, ExistingActivity>>;
  upsertActivities(kind: 'assignment' | 'test', rows: ActivityRow[]): Promise<void>;
  studentLookup(schoolId: string, emails: string[]): Promise<Map<string, string>>;
  existingAbsenceIds(schoolId: string, platform: Platform, externalIds: string[]): Promise<Set<string>>;
  upsertAbsences(rows: AbsenceRow[]): Promise<void>;
  startRun(integrationId: string, schoolId: string, triggeredBy: string | null): Promise<string>;
  finishRun(runId: string, integrationId: string, summary: SyncSummary): Promise<void>;
}

export interface SyncSummary {
  status: 'vellykket' | 'delvis' | 'feilet';
  created: number; updated: number; skipped: number; errorCount: number;
  errors: RowError[]; log: LogEntry[];
  integrationStatus: 'tilkoblet' | 'feil' | 'ikke_tilkoblet' | 'testmodus';
  message: string;
}

export const subjectKey = (s: string) => s.trim().toLowerCase();

export async function runSync(opts: {
  connector: Connector<any>; ctx: ConnectorContext; store: SyncStore; integrationId: string; triggeredBy?: string | null;
}): Promise<SyncSummary> {
  const { connector, ctx, store } = opts;
  const log = ctx.logger;
  const runId = await store.startRun(opts.integrationId, ctx.schoolId, opts.triggeredBy ?? null);
  const errors: RowError[] = [];
  let created = 0, updated = 0, skipped = 0;
  const okStatus = connector.platform === 'mock' ? 'testmodus' : 'tilkoblet';

  const finish = async (s: Omit<SyncSummary, 'log' | 'errors' | 'errorCount' | 'created' | 'updated' | 'skipped'>) => {
    const summary: SyncSummary = { ...s, created, updated, skipped, errors, errorCount: errors.length, log: log.entries };
    await store.finishRun(runId, opts.integrationId, summary);
    return summary;
  };

  // 1) Hent rådata
  let raw: unknown;
  try {
    log.info(`Starter synkronisering mot ${connector.displayName}`);
    raw = await connector.fetchRaw(ctx);
  } catch (err) {
    const e = err instanceof IntegrationError ? err : new IntegrationError('API_ERROR', String(err));
    log.error(e.message, { code: e.code });
    errors.push({ message: e.message });
    const notConnected = e.code === 'NOT_CONFIGURED' || e.code === 'NO_API_ACCESS';
    return finish({ status: 'feilet', integrationStatus: notConnected ? 'ikke_tilkoblet' : 'feil', message: e.message });
  }

  // 2) Normaliser til felles struktur
  let normalized: NormalizeResult;
  try {
    normalized = connector.normalize(raw, ctx);
  } catch (err) {
    log.error('Konvertering feilet', String(err));
    errors.push({ message: `Konvertering feilet: ${String(err)}` });
    return finish({ status: 'feilet', integrationStatus: 'feil', message: 'Kunne ikke konvertere data' });
  }
  errors.push(...normalized.errors);

  // 3) Valider og fjern duplikater i batchen
  const valid = normalized.activities.filter((a) => {
    const problem = validateActivity(a);
    if (problem) errors.push({ row: a.externalId, message: problem });
    return !problem;
  });
  const { unique, duplicates } = dedupe(valid);
  if (duplicates) { log.warn(`${duplicates} duplikat(er) i kildedata ble slått sammen`); skipped += duplicates; }

  // 4) Koble til fag
  const subjects = await store.subjectLookup(ctx.schoolId);
  const withSubject: { a: NormalizedActivity; subjectId: string }[] = [];
  for (const a of unique) {
    const sid = (a.subjectCode && subjects.get(subjectKey(a.subjectCode)))
      || (a.subjectName && subjects.get(subjectKey(a.subjectName)));
    if (!sid) { errors.push({ row: a.externalId, message: `Fant ikke fag "${a.subjectCode ?? a.subjectName ?? '–'}" for "${a.title}"` }); continue; }
    withSubject.push({ a, subjectId: sid });
  }

  // 5) Sammenlign med eksisterende rader (duplikatkontroll mot databasen)
  for (const kind of ['assignment', 'test'] as const) {
    const items = withSubject.filter((x) => x.a.kind === kind);
    if (!items.length) continue;
    const existing = await store.existingActivities(ctx.schoolId, connector.platform, kind, items.map((x) => x.a.externalId));
    const toWrite: ActivityRow[] = [];
    for (const { a, subjectId } of items) {
      const ex = existing.get(a.externalId);
      if (!ex) { created++; toWrite.push({ schoolId: ctx.schoolId, subjectId, platform: connector.platform, activity: a }); continue; }
      const changed = ex.title !== a.title || (ex.description ?? null) !== (a.description ?? null)
        || !sameInstant(ex.dueAt, a.dueAt) || !sameInstant(ex.startsAt, a.startsAt ?? null)
        || ex.activityType !== a.activityType || ex.subjectId !== subjectId;
      if (changed) { updated++; toWrite.push({ id: ex.id, schoolId: ctx.schoolId, subjectId, platform: connector.platform, activity: a }); }
      else skipped++;
    }
    try {
      if (toWrite.length) await store.upsertActivities(kind, toWrite);
    } catch (err) {
      log.error(`Lagring av ${kind} feilet`, String(err));
      errors.push({ message: `Lagring feilet: ${String(err)}` });
      return finish({ status: 'feilet', integrationStatus: 'feil', message: 'Databasefeil under lagring' });
    }
  }

  // 6) Fravær
  if (normalized.absences.length) {
    const { unique: abs, duplicates: d2 } = dedupe(normalized.absences);
    skipped += d2;
    const students = await store.studentLookup(ctx.schoolId, [...new Set(abs.map((a) => a.studentEmail))]);
    const existing = await store.existingAbsenceIds(ctx.schoolId, connector.platform, abs.map((a) => a.externalId));
    const rows: AbsenceRow[] = [];
    for (const a of abs) {
      const studentId = students.get(a.studentEmail);
      if (!studentId) { errors.push({ row: a.externalId, message: `Ukjent elev ${maskEmail(a.studentEmail)}` }); continue; }
      if (existing.has(a.externalId)) updated++; else created++;
      rows.push({ schoolId: ctx.schoolId, studentId, platform: connector.platform, absence: a,
        subjectId: a.subjectCode ? subjects.get(subjectKey(a.subjectCode)) ?? null : null });
    }
    if (rows.length) await store.upsertAbsences(rows);
  }

  const status = errors.length === 0 ? 'vellykket' : (created + updated + skipped > 0 ? 'delvis' : 'feilet');
  const message = `${created} nye, ${updated} oppdatert, ${skipped} uendret/duplikat, ${errors.length} feil`;
  log.info(`Ferdig: ${message}`);
  return finish({ status, integrationStatus: status === 'feilet' ? 'feil' : okStatus, message });
}

function sameInstant(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Date.parse(a) === Date.parse(b);
}

/** Personopplysninger skal ikke havne i synkroniseringslogger i klartekst */
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');
