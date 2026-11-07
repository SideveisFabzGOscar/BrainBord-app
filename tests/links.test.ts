/**
 * Direkte navigering: originallenker, vertssjekk, reserveløsninger og
 * assistentens tolkning av spørsmål som «Åpne prøven jeg har på fredag».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedUrl, resolveLink } from '../src/lib/links';
import { openFor } from '../src/lib/open-link';
import { unifyTasks, type TaskInput } from '../src/lib/unified';
import { describeSearch, findTasks } from '../src/lib/task-search';
import { teamsModule } from '../src/connections/teams';
import { canvasModule } from '../src/connections/canvas';
import { csvConnector } from '../src/integrations/connectors/csv';
import { createLogger } from '../src/integrations/types';

const env = { CANVAS_BASE_URL: 'https://skole.instructure.com', ISKOLE_PORTAL_URL: 'https://elev.iskole.net' };
const NOW = Date.parse('2026-11-07T11:00:00Z'); // lørdag 7. nov

test('Bare https-lenker til riktig system godtas', () => {
  assert.equal(isTrustedUrl('canvas', 'https://skole.instructure.com/courses/7/assignments/1', env), true);
  assert.equal(isTrustedUrl('canvas', 'https://annen.instructure.com/courses/7/assignments/1', env), false);
  assert.equal(isTrustedUrl('canvas', 'http://skole.instructure.com/courses/7', env), false);
  assert.equal(isTrustedUrl('canvas', 'javascript:alert(1)', env), false);
  assert.equal(isTrustedUrl('canvas', 'https://user:pw@skole.instructure.com/x', env), false);
  assert.equal(isTrustedUrl('teams', 'https://teams.microsoft.com/l/entity/66aeee93/classroom?context=x', env), true);
  assert.equal(isTrustedUrl('teams', 'https://teams.microsoft.com.evil.example/l/entity', env), false);
  assert.equal(isTrustedUrl('iskole', 'https://falsk-iskole.example/login', env), false);
});

test('Direkte lenke gir «Åpne oppgave»/«Åpne prøve»; ellers fag/startside med forklaring', () => {
  const d = resolveLink({ platform: 'canvas', url: 'https://skole.instructure.com/courses/7/assignments/1', kind: 'direkte' }, false, env)!;
  assert.equal(d.label, 'Åpne oppgave');
  assert.equal(d.kind, 'direkte');
  assert.equal(resolveLink({ platform: 'canvas', url: 'https://skole.instructure.com/courses/7/quizzes/3', kind: 'direkte' }, true, env)!.label, 'Åpne prøve');

  const sys = resolveLink({ platform: 'canvas', url: null, kind: 'system' }, false, env)!;
  assert.equal(sys.href, 'https://skole.instructure.com');
  assert.equal(sys.kind, 'system');
  assert.match(sys.note!, /ikke en direkte lenke/);

  const teams = resolveLink({ platform: 'teams', url: null, kind: null }, false, env)!;
  assert.equal(teams.href, 'https://teams.microsoft.com/');
  assert.equal(resolveLink({ platform: 'iskole', url: null, kind: null }, false, {}), null, 'iSkole uten kjent portaladresse: ingen gjetting');

  // Mistenkelig lenke i data erstattes av systemets startside, aldri fulgt
  const evil = resolveLink({ platform: 'canvas', url: 'https://phishing.example/login', kind: 'direkte' }, false, env)!;
  assert.equal(evil.href, 'https://skole.instructure.com');
});

test('Sammenslått oppgave bruker den beste lenken; ingen lenke => vis i Brainbord', () => {
  const [merged] = unifyTasks([
    { source: 'canvas', id: '1', title: 'Novelleanalyse', courseName: 'Norsk', dueAt: '2026-11-20T22:59:00Z', kind: 'oppgave', status: null, url: null, platform: 'canvas', linkKind: 'system' },
    { source: 'teams', id: 'a1', title: 'Novelleanalyse', courseName: 'Norsk', dueAt: '2026-11-20T22:00:00Z', kind: 'oppgave', status: null,
      url: 'https://teams.microsoft.com/l/entity/x', platform: 'teams', linkKind: 'direkte' },
  ] as TaskInput[], NOW);
  const o = openFor(merged.sources, false, env)!;
  assert.equal(o.platform, 'teams');
  assert.equal(o.kind, 'direkte');

  const hub = openFor([{ url: null, platform: 'iskole', linkKind: null, internalUrl: '/arshjul?aktivitet=t1' }], true, {})!;
  assert.equal(hub.href, '/arshjul?aktivitet=t1');
  assert.equal(hub.external, false);
  assert.match(hub.note!, /iSkole gir ingen direkte lenke/);
});

// ---------------- Assistentens søk ----------------
const mk = (o: Partial<TaskInput> & { id: string; title: string; dueAt: string }): TaskInput =>
  ({ source: 'canvas', courseName: null, kind: 'oppgave', status: 'ikke_levert', url: `https://skole.instructure.com/x/${o.id}`, platform: 'canvas', linkKind: 'direkte', ...o });
const tasks = unifyTasks([
  mk({ id: 'p1', title: 'Kapittelprøve vektorer', courseName: 'Matematikk R1', kind: 'prove', dueAt: '2026-11-10T07:30:00Z', activityType: 'prove' }),
  mk({ id: 'p2', title: 'Glosetest', courseName: 'Engelsk fordypning', kind: 'prove', dueAt: '2026-11-13T09:00:00Z', activityType: 'prove' }), // fredag
  mk({ id: 'i1', title: 'Innlevering: funksjoner', courseName: 'Matematikk R1', dueAt: '2026-11-12T22:59:00Z', activityType: 'innlevering' }),
  mk({ id: 'l1', title: 'Lekse: les kapittel 4', courseName: 'Engelsk fordypning', dueAt: '2026-11-09T07:00:00Z', activityType: 'lekse' }),
  mk({ id: 'n1', title: 'Novelleanalyse', courseName: 'Norsk', dueAt: '2026-11-08T21:00:00Z', activityType: 'innlevering', status: 'levert' }),
  mk({ id: 'n2', title: 'Fagtekst', courseName: 'Norsk', dueAt: '2026-11-11T21:00:00Z', activityType: 'innlevering' }),
  mk({ id: 'x1', title: 'Neste ukes prosjekt', courseName: 'Historie', dueAt: '2026-11-18T21:00:00Z', activityType: 'prosjekt' }),
], NOW).map((t) => ({ ...t, open: openFor(t.sources, t.kind === 'prove', env) }));

test('«Når har jeg neste prøve?» => den første kommende prøven', () => {
  const r = findTasks('Når har jeg neste prøve?', tasks, NOW);
  assert.equal(r.single, true);
  assert.deepEqual(r.matches.map((t) => t.title), ['Kapittelprøve vektorer']);
  assert.equal(r.matches[0].open!.label, 'Åpne prøve');
  assert.match(describeSearch(r, 'x'), /Kapittelprøve vektorer i Matematikk R1/);
});

test('«Vis meg matteinnleveringen» => matematikk-innleveringen med Åpne oppgave', () => {
  const r = findTasks('Vis meg matteinnleveringen.', tasks, NOW);
  assert.deepEqual(r.matches.map((t) => t.title), ['Innlevering: funksjoner']);
  assert.equal(r.matches[0].open!.label, 'Åpne oppgave');
  assert.equal(r.matches[0].open!.href, 'https://skole.instructure.com/x/i1');
});

test('«Hvor finner jeg engelskleksa?» => engelsk-leksa', () => {
  const r = findTasks('Hvor finner jeg engelskleksa?', tasks, NOW);
  assert.deepEqual(r.matches.map((t) => t.title), ['Lekse: les kapittel 4']);
});

test('«Åpne prøven jeg har på fredag» => prøven fredag 13. nov', () => {
  const r = findTasks('Åpne prøven jeg har på fredag', tasks, NOW);
  assert.deepEqual(r.matches.map((t) => t.title), ['Glosetest']);
  assert.ok(r.understood.some((u) => u.startsWith('fredag 13.11')));
});

test('«Hvilke oppgaver må jeg levere denne uken?» => ikke-leverte oppgaver ut søndag', () => {
  // Lørdag 7. nov: «denne uken» = lørdag og søndag
  const r = findTasks('Hvilke oppgaver må jeg levere denne uken?', tasks, NOW);
  assert.deepEqual(r.matches.map((t) => t.title), []); // Novelleanalysen søndag er allerede levert
  const mon = Date.parse('2026-11-09T06:00:00Z'); // mandag
  const r2 = findTasks('Hvilke oppgaver må jeg levere denne uken?', tasks, mon);
  assert.deepEqual(r2.matches.map((t) => t.title), ['Lekse: les kapittel 4', 'Fagtekst', 'Innlevering: funksjoner']);
  assert.equal(r2.single, false);
});

test('Ingen treff => ærlig svar, ingen påfunnet oppgave', () => {
  const r = findTasks('Åpne tyskprøven', tasks, NOW);
  assert.equal(r.matches.length, 0);
  assert.match(describeSearch(r, 'Åpne tyskprøven'), /fant ingen oppføring/);
  assert.equal(findTasks('Hvordan har du det?', tasks, NOW).recognized, false);
});

// ---------------- Originallenker fra kildene ----------------
test('Teams: henter offisiell webUrl fra klasse-endepunktet når listen mangler den', async () => {
  const calls: string[] = [];
  const f = (async (u: string) => {
    calls.push(u);
    const url = new URL(u);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.pathname === '/v1.0/me') return json({ id: 'u', displayName: 'Emma' });
    if (url.pathname === '/v1.0/education/me/classes') return json({ value: [{ id: 'c1', displayName: 'Norsk' }] });
    if (url.pathname === '/v1.0/education/me/assignments') return json({ value: [
      { id: 'a1', classId: 'c1', displayName: 'Novelle', status: 'assigned', dueDateTime: '2026-11-20T22:59:00Z', webUrl: null, submissions: [{ id: 's', status: 'working' }] },
      { id: 'a2', classId: 'c1', displayName: 'Uten lenke', status: 'assigned', dueDateTime: '2026-11-21T22:59:00Z', webUrl: null, submissions: [] },
    ] });
    if (url.pathname === '/v1.0/education/classes/c1/assignments/a1') return json({ id: 'a1', webUrl: 'https://teams.microsoft.com/l/entity/66aeee93/classroom?context=abc' });
    if (url.pathname === '/v1.0/education/classes/c1/assignments/a2') return new Response('{}', { status: 404 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  const r = await teamsModule.fetchData({ env: {}, fetch: f, now: () => NOW }, 'tok');
  const a1 = r.items.find((i) => i.externalId === 'a1')!;
  assert.equal(a1.url, 'https://teams.microsoft.com/l/entity/66aeee93/classroom?context=abc');
  assert.equal(a1.linkKind, 'direkte');
  assert.equal(a1.courseId, 'c1');
  const a2 = r.items.find((i) => i.externalId === 'a2')!;
  assert.equal(a2.url, null);
  assert.equal(a2.linkKind, 'system');
});

test('Canvas: bruker html_url fra API-et og konstruerer ingen lenker', async () => {
  const f = (async (u: string) => {
    const url = new URL(u);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.pathname === '/api/v1/users/self') return json({ id: 1, name: 'Emma' });
    if (url.pathname === '/api/v1/courses') return json([{ id: 7, name: 'Norsk' }]);
    if (url.pathname === '/api/v1/courses/7/assignments') return json([
      { id: 1, name: 'Med lenke', due_at: '2026-11-20T22:59:00Z', html_url: 'https://skole.instructure.com/courses/7/assignments/1', submission: { workflow_state: 'unsubmitted' } },
      { id: 2, name: 'Uten lenke', due_at: '2026-11-21T22:59:00Z', submission: { workflow_state: 'unsubmitted' } },
    ]);
    if (url.pathname === '/api/v1/conversations') return json([{ id: 9, subject: 'Hei', last_message: 'x' }]);
    return json([]);
  }) as unknown as typeof fetch;
  const r = await canvasModule.fetchData({ env: { CANVAS_BASE_URL: 'https://skole.instructure.com' }, fetch: f, now: () => NOW }, 'tok');
  const by = (t: string) => r.items.find((i) => i.title === t)!;
  assert.equal(by('Med lenke').url, 'https://skole.instructure.com/courses/7/assignments/1');
  assert.equal(by('Med lenke').linkKind, 'direkte');
  assert.equal(by('Uten lenke').url, null);
  assert.equal(by('Norsk').url ?? null, null, 'emnelenke konstrueres ikke');
  assert.equal(by('Hei').url, null, 'meldingslenke konstrueres ikke');
});

test('CSV-import fra iSkole/itslearning: lenke-kolonne lagres bare som https', () => {
  const raw = { header: ['id', 'tittel', 'type', 'fag', 'frist', 'lenke'], importType: 'aktiviteter' as const, rows: [
    ['P1', 'Heldagsprøve', 'prøve', 'NOR1260', '24.11.2026 08:30', 'https://elev.iskole.net/prove/123'],
    ['P2', 'Prøve 2', 'prøve', 'NOR1260', '25.11.2026 08:30', 'http://usikker.example/x'],
  ] };
  const n = csvConnector.normalize(raw, { schoolId: 's', config: {}, env: {}, fetch, logger: createLogger() });
  assert.equal(n.activities[0].url, 'https://elev.iskole.net/prove/123');
  assert.equal(n.activities[1].url, null);
  assert.match(n.errors[0].message, /https/);
});
