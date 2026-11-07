import { classifyByTitle, isTestType, stableId } from '../normalize';
import {
  IntegrationError, type AbsenceType, type ActivityType, type Connector, type ConnectorContext, type NormalizeResult,
} from '../types';

/**
 * CSV-import – godkjent importvei for plattformer uten åpent API
 * (f.eks. eksport fra itslearning, iSkole, Visma InSchool eller Excel).
 * Støtter ; , og tab som skilletegn, anførselstegn og norske datoformater.
 */
export interface CsvRaw { header: string[]; rows: string[][]; importType: 'aktiviteter' | 'fravaer' }

export function parseCsv(content: string): string[][] {
  const text = content.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].reduce((best, d) =>
    countOutsideQuotes(firstLine, d) > countOutsideQuotes(firstLine, best) ? d : best, ',');
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

function countOutsideQuotes(line: string, ch: string) {
  let n = 0, q = false;
  for (const c of line) { if (c === '"') q = !q; else if (c === ch && !q) n++; }
  return n;
}

const norm = (h: string) => h.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/[^a-z0-9]/g, '');

const ALIASES: Record<string, string[]> = {
  id: ['id', 'eksternid', 'externalid', 'oppgaveid', 'proveid', 'fravaersid', 'fravarsid'],
  title: ['tittel', 'title', 'oppgavenavn', 'navn', 'provenavn', 'name'],
  type: ['type', 'aktivitetstype', 'kategori'],
  subject: ['fag', 'fagkode', 'subject', 'emne', 'course'],
  description: ['beskrivelse', 'description', 'info'],
  start: ['start', 'startdato', 'fra', 'startsat'],
  due: ['frist', 'dato', 'due', 'dueat', 'provedato', 'date', 'tidspunkt'],
  email: ['elevepost', 'epost', 'email', 'eleve-post', 'elevemail'],
  from: ['fra', 'fratid', 'from'],
  to: ['til', 'tiltid', 'to'],
  hours: ['timer', 'antalltimer', 'hours'],
  absenceType: ['fravaerstype', 'fravarstype', 'type', 'arsak'],
  documented: ['dokumentert', 'documented', 'dokumentasjon'],
};

function columnIndex(header: string[], key: string): number {
  const h = header.map(norm);
  for (const alias of ALIASES[key]) { const i = h.indexOf(norm(alias)); if (i >= 0) return i; }
  return -1;
}

const TYPE_MAP: Record<string, ActivityType> = {
  innlevering: 'innlevering', oppgave: 'oppgave', lekse: 'lekse', prosjekt: 'prosjekt', presentasjon: 'presentasjon',
  frist: 'frist', annet: 'annet', prove: 'prove', 'prøve': 'prove', test: 'prove', eksamen: 'eksamen', exam: 'eksamen',
};
const ABS_MAP: Record<string, AbsenceType> = {
  sykdom: 'sykdom', syk: 'sykdom', legetime: 'legetime', lege: 'legetime', tannlege: 'legetime', permisjon: 'permisjon',
  skoleaktivitet: 'skoleaktivitet', annet: 'annet', udokumentert: 'udokumentert',
};

/** Tolker "24.11.2026 14:00", "2026-11-24", "2026-11-24T14:00" som norsk tid => ISO med riktig offset */
export function parseNorwegianDate(s: string, defaultTime = '23:59'): string | null {
  const v = s.trim();
  let y: number, mo: number, d: number, hh = 0, mi = 0;
  let m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2})[:.](\d{2}))?$/);
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (m[4]) { hh = +m[4]; mi = +m[5]; } else [hh, mi] = defaultTime.split(':').map(Number); }
  else if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/))) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) && v.length > 16) return isNaN(Date.parse(v)) ? null : new Date(v).toISOString();
    y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4]) { hh = +m[4]; mi = +m[5]; } else [hh, mi] = defaultTime.split(':').map(Number);
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, hh, mi);
  const offsetMin = osloOffsetMinutes(new Date(guess));
  const date = new Date(guess - offsetMin * 60_000);
  // sjekk at dagen faktisk finnes (f.eks. 31.02)
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCMonth() !== mo - 1) return null;
  return date.toISOString();
}

export function osloOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'shortOffset' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 60;
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (m[3] ? +m[3] : 0));
}

const yes = (s: string) => /^(ja|j|yes|y|true|1|x|godkjent)$/i.test(s.trim());

export const csvConnector: Connector<CsvRaw> = {
  platform: 'csv',
  displayName: 'CSV-import',
  authType: 'file_upload',
  status: () => ({ configured: true, missing: [], accessNote: 'Alltid tilgjengelig. Last opp CSV eksportert fra en læringsplattform.' }),

  async fetchRaw(ctx: ConnectorContext) {
    if (!ctx.file) throw new IntegrationError('NOT_CONFIGURED', 'Ingen fil lastet opp');
    if (ctx.file.content.length > 5_000_000) throw new IntegrationError('PARSE_ERROR', 'Filen er for stor (maks 5 MB)');
    const rows = parseCsv(ctx.file.content);
    if (rows.length < 2) throw new IntegrationError('PARSE_ERROR', 'CSV-filen må ha overskriftsrad og minst én datarad');
    ctx.logger.info(`Leste ${rows.length - 1} rader fra ${ctx.file.name}`);
    return { header: rows[0], rows: rows.slice(1), importType: ctx.file.importType };
  },

  normalize(raw): NormalizeResult {
    return raw.importType === 'fravaer' ? normalizeAbsences(raw) : normalizeActivities(raw);
  },
};

function normalizeActivities(raw: CsvRaw): NormalizeResult {
  const res: NormalizeResult = { activities: [], absences: [], errors: [] };
  const c = Object.fromEntries(['id', 'title', 'type', 'subject', 'description', 'start', 'due'].map((k) => [k, columnIndex(raw.header, k)]));
  if (c.title < 0 || c.due < 0) {
    res.errors.push({ message: 'CSV må ha kolonnene "tittel" og "frist" (eller "dato")' });
    return res;
  }
  raw.rows.forEach((r, i) => {
    const line = i + 2;
    const title = r[c.title] ?? '';
    const dueAt = parseNorwegianDate(r[c.due] ?? '');
    if (!title) return res.errors.push({ row: line, message: 'Mangler tittel' });
    if (!dueAt) return res.errors.push({ row: line, message: `Ugyldig dato "${r[c.due]}" (bruk dd.mm.åååå eller åååå-mm-dd)` });
    const rawType = c.type >= 0 ? (r[c.type] ?? '').toLowerCase().trim() : '';
    if (rawType && !TYPE_MAP[rawType]) return res.errors.push({ row: line, message: `Ukjent type "${r[c.type]}"` });
    const type = TYPE_MAP[rawType] ?? classifyByTitle(title, 'oppgave');
    const subject = c.subject >= 0 ? r[c.subject] || null : null;
    res.activities.push({
      externalId: c.id >= 0 && r[c.id] ? `csv:${r[c.id]}` : `csv:${stableId(title, subject, dueAt.slice(0, 10))}`,
      kind: isTestType(type) ? 'test' : 'assignment',
      activityType: type,
      title,
      description: c.description >= 0 ? r[c.description] || null : null,
      subjectCode: subject,
      startsAt: c.start >= 0 && r[c.start] ? parseNorwegianDate(r[c.start], '08:00') : null,
      dueAt,
    });
  });
  return res;
}

function normalizeAbsences(raw: CsvRaw): NormalizeResult {
  const res: NormalizeResult = { activities: [], absences: [], errors: [] };
  const h = raw.header;
  const c = { id: columnIndex(h, 'id'), email: columnIndex(h, 'email'), date: columnIndex(h, 'due'),
    from: columnIndex(h, 'from'), to: columnIndex(h, 'to'), hours: columnIndex(h, 'hours'),
    type: columnIndex(h, 'absenceType'), subject: columnIndex(h, 'subject'), documented: columnIndex(h, 'documented') };
  if (c.email < 0 || c.date < 0) { res.errors.push({ message: 'Fravær-CSV må ha kolonnene "elev_epost" og "dato"' }); return res; }
  raw.rows.forEach((r, i) => {
    const line = i + 2;
    const email = (r[c.email] ?? '').toLowerCase();
    const iso = parseNorwegianDate(r[c.date] ?? '', '12:00');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.errors.push({ row: line, message: 'Ugyldig e-post' });
    if (!iso) return res.errors.push({ row: line, message: `Ugyldig dato "${r[c.date]}"` });
    const date = new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
    const from = c.from >= 0 ? r[c.from] || null : null;
    const to = c.to >= 0 ? r[c.to] || null : null;
    let hours = c.hours >= 0 ? Number((r[c.hours] ?? '').replace(',', '.')) : NaN;
    if (!Number.isFinite(hours) && from && to) {
      const [fh, fm] = from.split(/[:.]/).map(Number), [th, tm] = to.split(/[:.]/).map(Number);
      hours = Math.round(((th * 60 + tm) - (fh * 60 + fm)) / 30) / 2;
    }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return res.errors.push({ row: line, message: 'Ugyldig antall timer' });
    const t = c.type >= 0 ? (r[c.type] ?? '').toLowerCase().trim() : '';
    const documented = c.documented >= 0 ? yes(r[c.documented] ?? '') : false;
    res.absences.push({
      externalId: c.id >= 0 && r[c.id] ? `csv:${r[c.id]}` : `csv:${stableId(email, date, from, to)}`,
      studentEmail: email, date, fromTime: from?.replace('.', ':') ?? null, toTime: to?.replace('.', ':') ?? null, hours,
      absenceType: ABS_MAP[t] ?? (documented ? 'annet' : 'udokumentert'),
      subjectCode: c.subject >= 0 ? r[c.subject] || null : null,
      documented,
    });
  });
  return res;
}
