/**
 * Enhetstester for integrasjonsarkitekturen.
 * Kjør: npm test   (eller: npx tsx --test tests/*.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/integrations/memory-store';
import { runSync } from '../src/integrations/sync-engine';
import { createLogger, type ConnectorContext } from '../src/integrations/types';
import { csvConnector, parseCsv, parseNorwegianDate } from '../src/integrations/connectors/csv';
import { canvasConnector } from '../src/integrations/connectors/canvas';
import { teamsConnector } from '../src/integrations/connectors/teams';
import { itslearningConnector } from '../src/integrations/connectors/partner-rest';
import { mockConnector } from '../src/integrations/connectors/mock';
import { classifyByTitle, stripHtml } from '../src/integrations/normalize';

const SCHOOL = 'school-1';
function store() {
  const s = new MemoryStore();
  for (const [code, id] of [['NOR1260', 'subj-nor'], ['MAT1001', 'subj-mat'], ['FYS1001', 'subj-fys'],
    ['HIS1010', 'subj-his'], ['KJE1001', 'subj-kje'], ['Norsk', 'subj-nor'], ['MAT-R1', 'subj-mat']]) s.subjects.set(code, id);
  s.students.set('emma@skole.test', 'stud-emma');
  return s;
}
function ctx(over: Partial<ConnectorContext> = {}): ConnectorContext {
  return { schoolId: SCHOOL, config: {}, env: {}, fetch: (() => { throw new Error('ingen nettverk i test'); }) as any,
    logger: createLogger(), ...over };
}

// ---------------- CSV ----------------
test('CSV: semikolon, anførselstegn, BOM og norske datoer', () => {
  const rows = parseCsv('﻿tittel;fag;frist\n"Analyse; ""Et dukkehjem""";NOR1260;24.11.2026 14:00\n');
  assert.deepEqual(rows[1], ['Analyse; "Et dukkehjem"', 'NOR1260', '24.11.2026 14:00']);
  assert.equal(parseNorwegianDate('24.11.2026 14:00'), '2026-11-24T13:00:00.000Z'); // vintertid UTC+1
  assert.equal(parseNorwegianDate('2027-05-24 09:00'), '2027-05-24T07:00:00.000Z'); // sommertid UTC+2
  assert.equal(parseNorwegianDate('31.02.2027'), null);
  assert.equal(parseNorwegianDate('i morgen'), null);
});

test('CSV-import: oppretter, oppdager duplikater og rapporterer feil per rad', async () => {
  const s = store();
  const csv = [
    'id,tittel,type,fag,frist,beskrivelse',
    'A1,Fagtekst om sosiale medier,innlevering,NOR1260,20.11.2026 23:59,Skriv 600 ord',
    'A2,Kapittelprøve 3,prøve,MAT1001,26.11.2026 08:30,',
    'A2,Kapittelprøve 3,prøve,MAT1001,26.11.2026 08:30,',      // duplikat i fil
    'A3,Ukjent fag-oppgave,oppgave,XYZ999,01.12.2026,',          // ukjent fag
    'A4,Ugyldig dato,oppgave,NOR1260,32.13.2026,',               // ugyldig dato
  ].join('\n');
  const file = { name: 'eksport.csv', content: csv, importType: 'aktiviteter' as const };
  const r1 = await runSync({ connector: csvConnector, ctx: ctx({ file }), store: s, integrationId: 'csv' });
  assert.equal(r1.created, 2);
  assert.equal(r1.skipped, 1);
  assert.equal(r1.errorCount, 2);
  assert.equal(r1.status, 'delvis');
  assert.equal([...s.activities.values()].find((a) => a.externalId === 'csv:A2')?.activityType, 'prove');

  // Samme fil på nytt => ingen nye rader (duplikatkontroll mot "databasen")
  const r2 = await runSync({ connector: csvConnector, ctx: ctx({ file }), store: s, integrationId: 'csv' });
  assert.equal(r2.created, 0);
  assert.equal(r2.updated, 0);
  assert.equal(s.activities.size, 2);
});

test('CSV-fravær: kobler mot elev via e-post, maskerer e-post i feilmeldinger', async () => {
  const s = store();
  const file = { name: 'fravaer.csv', importType: 'fravaer' as const, content:
    'elev_epost;dato;fra;til;type;dokumentert\nemma@skole.test;03.11.2026;08:15;10:15;sykdom;ja\nukjent@skole.test;03.11.2026;08:15;09:15;;nei' };
  const r = await runSync({ connector: csvConnector, ctx: ctx({ file }), store: s, integrationId: 'csv' });
  assert.equal(r.created, 1);
  const a = [...s.absences.values()][0];
  assert.equal(a.absence.hours, 2);
  assert.equal(a.absence.absenceType, 'sykdom');
  assert.equal(a.absence.documented, true);
  assert.match(r.errors[0].message, /u\*\*\*@skole\.test/);
  assert.doesNotMatch(JSON.stringify(r.log), /ukjent@skole/);
});

// ---------------- Testintegrasjon ----------------
test('Testintegrasjon: første sync oppretter, endring gir oppdatering, uendret hoppes over', async () => {
  const s = store();
  const base = { baseDate: '2026-11-07T10:00:00Z' };
  const r1 = await runSync({ connector: mockConnector, ctx: ctx({ config: { ...base, revision: 1 } }), store: s, integrationId: 'mock' });
  assert.equal(r1.created, 6);
  assert.equal(r1.integrationStatus, 'testmodus');
  const r2 = await runSync({ connector: mockConnector, ctx: ctx({ config: { ...base, revision: 2 } }), store: s, integrationId: 'mock' });
  assert.equal(r2.created, 0);
  assert.equal(r2.updated, 1);
  assert.equal(r2.skipped, 5);
  assert.match([...s.activities.values()].find((a) => a.externalId === 'mock:m1')!.title, /revidert v2/);
});

// ---------------- Ærlighet om manglende tilgang ----------------
test('Ekte plattformer uten nøkler later IKKE som de er tilkoblet', async () => {
  for (const c of [teamsConnector, canvasConnector, itslearningConnector]) {
    const s = store();
    assert.equal(c.status({ env: {}, config: {} }).configured, false);
    const r = await runSync({ connector: c, ctx: ctx(), store: s, integrationId: c.platform });
    assert.equal(r.status, 'feilet');
    assert.equal(r.integrationStatus, 'ikke_tilkoblet');
    assert.equal(s.activities.size, 0);
  }
});

// ---------------- Teams (Graph) med falsk HTTP ----------------
function fakeFetch(routes: Record<string, (url: string) => { status?: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    const r = routes[key](url);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('Teams: OAuth-token, paginering, utkast filtreres, HTML renses', async () => {
  const { f, calls } = fakeFetch({
    '/oauth2/v2.0/token': () => ({ body: { access_token: 'tok' } }),
    '/education/classes?': () => ({ body: { value: [{ id: 'c1', displayName: 'Norsk 2STA', classCode: 'NOR1260' }] } }),
    '/education/classes/c1/assignments?$top=100': () => ({ body: {
      value: [{ id: 'x1', displayName: 'Novelleanalyse', status: 'assigned', dueDateTime: '2026-11-20T22:59:00Z',
        instructions: { content: '<p>Les <b>novellen</b></p>' } }],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/education/classes/c1/assignments?page=2' } }),
    'assignments?page=2': () => ({ body: { value: [
      { id: 'x2', displayName: 'Utkast', status: 'draft', dueDateTime: '2026-12-01T10:00:00Z' },
      { id: 'x3', displayName: 'Heldagsprøve', status: 'assigned', dueDateTime: '2026-12-03T07:30:00Z' }] } }),
  });
  const s = store();
  const r = await runSync({ connector: teamsConnector, store: s, integrationId: 'teams',
    ctx: ctx({ fetch: f, env: { MS_TENANT_ID: 't', MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 'sec' } }) });
  assert.equal(r.status, 'vellykket', JSON.stringify(r.errors));
  assert.equal(r.created, 2);
  const acts = [...s.activities.values()];
  assert.equal(acts.find((a) => a.externalId === 'teams:x1')?.description, 'Les novellen');
  assert.equal(acts.find((a) => a.externalId === 'teams:x3')?.kind, 'test');
  assert.ok(calls.some((c) => c.includes('page=2')), 'skal følge @odata.nextLink');
});

test('Teams: avvist token gir AUTH_FAILED og status feil', async () => {
  const { f } = fakeFetch({ '/oauth2/v2.0/token': () => ({ status: 401, body: { error: 'invalid_client' } }) });
  const r = await runSync({ connector: teamsConnector, store: store(), integrationId: 'teams',
    ctx: ctx({ fetch: f, env: { MS_TENANT_ID: 't', MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 'feil' } }) });
  assert.equal(r.status, 'feilet');
  assert.equal(r.integrationStatus, 'feil');
  assert.match(r.errors[0].message, /Autentisering avvist/);
  assert.doesNotMatch(JSON.stringify(r.log), /feil"/); // hemmeligheten logges ikke
});

// ---------------- Canvas med Link-paginering og retry ----------------
test('Canvas: Link-header-paginering, quiz => prøve, retry ved 503', async () => {
  let failOnce = true;
  const { f } = fakeFetch({
    '/api/v1/courses?': () => ({ body: [{ id: 7, name: 'Matematikk R1', course_code: 'MAT-R1' }] }),
    '/api/v1/courses/7/assignments?per_page=100': (): { status?: number; body: unknown; headers?: Record<string, string> } => {
      if (failOnce) { failOnce = false; return { status: 503, body: {}, headers: { 'retry-after': '0' } }; }
      return { body: [{ id: 1, name: 'Innlevering 1', due_at: '2026-11-18T22:00:00Z' }],
        headers: { link: '<https://canvas.test/api/v1/courses/7/assignments?page=2&per_page=100>; rel="next"' } };
    },
    'assignments?page=2': () => ({ body: [{ id: 2, name: 'Quiz kap 3', due_at: '2026-11-25T08:00:00Z', is_quiz_assignment: true }] }),
  });
  const s = store();
  const r = await runSync({ connector: canvasConnector, store: s, integrationId: 'canvas',
    ctx: ctx({ fetch: f, env: { CANVAS_BASE_URL: 'https://canvas.test', CANVAS_API_TOKEN: 'x' } }) });
  assert.equal(r.status, 'vellykket', JSON.stringify(r.errors));
  assert.equal(r.created, 2);
  assert.equal([...s.activities.values()].find((a) => a.externalId === 'canvas:2')?.activityType, 'prove');
  assert.ok(r.log.some((l) => l.message.includes('HTTP 503')));
});

test('Normalisering: klassifisering og HTML-rensing', () => {
  assert.equal(classifyByTitle('Eksamen i norsk'), 'eksamen');
  assert.equal(classifyByTitle('Heldagsprøve kap. 1-4'), 'prove');
  assert.equal(classifyByTitle('Muntlig presentasjon'), 'presentasjon');
  assert.equal(stripHtml('<script>alert(1)</script><p>Hei&nbsp;&amp; velkommen</p>'), 'Hei & velkommen');
});
