/**
 * Felles datastruktur for alle læringsplattformer.
 * Hver connector konverterer plattformens egne data til disse typene,
 * slik at resten av SkoleHub aldri trenger å vite hvor dataene kom fra.
 */

export type Platform = 'teams' | 'itslearning' | 'iskole' | 'canvas' | 'csv' | 'mock';

export type ActivityType =
  | 'innlevering' | 'oppgave' | 'lekse' | 'prosjekt' | 'presentasjon' | 'frist' | 'annet'
  | 'prove' | 'eksamen';

export type AbsenceType = 'sykdom' | 'legetime' | 'permisjon' | 'skoleaktivitet' | 'annet' | 'udokumentert';

export interface NormalizedActivity {
  externalId: string;
  kind: 'assignment' | 'test';
  activityType: ActivityType;
  title: string;
  description?: string | null;
  /** Udir-fagkode eller plattformens kurs-ID – brukes for å finne riktig fag */
  subjectCode?: string | null;
  subjectName?: string | null;
  startsAt?: string | null; // ISO 8601
  dueAt: string;            // ISO 8601
}

export interface NormalizedAbsence {
  externalId: string;
  studentEmail: string;     // matches mot students.email
  date: string;             // YYYY-MM-DD
  fromTime?: string | null; // HH:MM
  toTime?: string | null;
  hours: number;
  absenceType: AbsenceType;
  subjectCode?: string | null;
  documented: boolean;
}

export interface RowError { row?: number | string; message: string }

export interface NormalizeResult {
  activities: NormalizedActivity[];
  absences: NormalizedAbsence[];
  errors: RowError[];
}

export type AuthType = 'oauth2_client_credentials' | 'api_token' | 'file_upload' | 'none';

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry { at: string; level: LogLevel; message: string; data?: unknown }
export interface Logger { info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void; error(m: string, d?: unknown): void; entries: LogEntry[] }

export interface ConnectorContext {
  schoolId: string;
  /** Ikke-hemmelig konfig fra integrations.config (tenant-id, base-URL …) */
  config: Record<string, unknown>;
  /** Hemmeligheter fra servermiljøet. Lagres aldri i databasen. */
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  logger: Logger;
  /** Kun for filbaserte connectorer (CSV) */
  file?: { name: string; content: string; importType: 'aktiviteter' | 'fravaer' };
  since?: Date | null;
}

export interface ConnectorStatus {
  configured: boolean;
  /** Hva som mangler for å kunne koble til ekte data */
  missing: string[];
  /** Ærlig beskrivelse av tilgangssituasjonen */
  accessNote: string;
}

export interface Connector<Raw = unknown> {
  platform: Platform;
  displayName: string;
  authType: AuthType;
  /** Offisiell dokumentasjon for API-et connectoren bygger på */
  docsUrl?: string;
  status(ctx: Pick<ConnectorContext, 'env' | 'config'>): ConnectorStatus;
  /** Henter rådata fra plattformen (autentisering + paginering) */
  fetchRaw(ctx: ConnectorContext): Promise<Raw>;
  /** Konverterer rådata til felles struktur. Ren funksjon – enkel å teste. */
  normalize(raw: Raw, ctx: ConnectorContext): NormalizeResult;
}

export type IntegrationErrorCode =
  | 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'API_ERROR' | 'PARSE_ERROR' | 'NO_API_ACCESS';

export class IntegrationError extends Error {
  constructor(public code: IntegrationErrorCode, message: string, public detail?: unknown) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export function createLogger(): Logger {
  const entries: LogEntry[] = [];
  const push = (level: LogLevel) => (message: string, data?: unknown) => {
    entries.push({ at: new Date().toISOString(), level, message, ...(data === undefined ? {} : { data }) });
  };
  return { entries, info: push('info'), warn: push('warn'), error: push('error') };
}
