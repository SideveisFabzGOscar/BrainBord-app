/**
 * Tester for personlige tilkoblinger (Canvas, Teams, iSkole).
 * Leverandørenes API-er simuleres med en falsk fetch som følger de offisielle
 * dokumenterte formatene. Dette er IKKE en test mot ekte Canvas/Microsoft.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { canvasModule, canvasSubmissionStatus } from '../src/connections/canvas';
import { teamsModule } from '../src/connections/teams';
import { iskoleModule } from '../src/connections/iskole';
import { completeConnection, disconnect, syncConnection, type ConnectionPatch, type ConnectionRow, type ConnectionStore, type Deps } from '../src/connections/service';
import { createOAuthState, decryptTokens, encryptTokens, verifyOAuthState } from '../src/connections/vault';
import type { ConnPlatform, PersonalItem, ProviderContext } from '../src/connections/types';

const KEY = randomBytes(32).toString('base64');
const NOW = Date.parse('2026-11-07T11:00:00Z');
const USER = 'user-emma';

class MemStore implements ConnectionStore {
  rows = new Map<string, ConnectionRow & ConnectionPatch>();
  items = new Map<string, PersonalItem[]>();
  k = (u: string, p: string) => `${u}|${p}`;
  async get(u: string, p: ConnPlatform): Promise<(ConnectionRow & ConnectionPatch) | null> { return this.rows.get(this.k(u, p)) ?? null; }
  async save(u: string, p: ConnPlatform, patch: ConnectionPatch) {
    const prev = this.rows.get(this.k(u, p)) ?? { status: 'ikke_tilkoblet', tokenCiphertext: null, tokenIv: null, accessExpiresAt: null };
    this.rows.set(this.k(u, p), { ...prev, ...patch } as ConnectionRow & ConnectionPatch);
  }
  async replaceItems(u: string, p: ConnPlatform, items: PersonalItem[]) { this.items.set(this.k(u, p), items); }
  async remove(u: string, p: ConnPlatform) { this.rows.delete(this.k(u, p)); this.items.delete(this.k(u, p)); }
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> };
function fakeFetch(routes: [RegExp, Handler][]) {
  const calls: { url: string; method: string; auth: string | null; body: string }[] = [];
  const f = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? null;
    calls.push({ url: input, method: init.method ?? 'GET', auth, body: init.body ? String(init.body) : '' });
    const r = routes.find(([re]) => re.test(`${init.method ?? 'GET'} ${url.pathname}${url.search}`));
    if (!r) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    const out = r[1](url, init);
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200, headers: out.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const canvasEnv = { CANVAS_BASE_URL: 'https://skole.instructure.com', CANVAS_CLIENT_ID: '10000000000001', CANVAS_CLIENT_SECRET: 'canvas-secret', TOKEN_ENCRYPTION_KEY: KEY };
const msEnv = { MS_CLIENT_ID: 'app-id', MS_CLIENT_SECRET: 'ms-secret', MS_TENANT_ID: 'skole.no', TOKEN_ENCRYPTION_KEY: KEY };
const deps = (f: typeof fetch, env: Record<string, string>, store: MemStore = new MemStore(), now = NOW): Deps & { store: MemStore } => ({
  ctx: { env, fetch: f, now: () => now } as ProviderContext, store, redirectUri: (p) => `https://skolehub.no/api/connect/${p}/callback`,
});

// Canvas-svar etter offisiell dokumentasjon
const canvasRoutes = (opts: { failConversations?: boolean; expireOnce?: boolean } = {}): [RegExp, Handler][] => {
  let expired = !!opts.expireOnce;
  return [
    [/^POST \/login\/oauth2\/token/, (_u, init) => {
      const p = new URLSearchParams(String(init.body));
      if (p.get('grant_type') === 'authorization_code' && p.get('code') === 'god-kode')
        return { body: { access_token: 'cv-access-1', refresh_token: 'cv-refresh', expires_in: 3600, user: { id: 42, name: 'Emma' } } };
      if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') === 'cv-refresh') return { body: { access_token: 'cv-access-2', expires_in: 3600 } };
      return { status: 400, body: { error: 'invalid_grant' } };
    }],
    [/^DELETE \/login\/oauth2\/token/, () => ({ body: {} })],
    [/^GET \/api\/v1\/users\/self/, () => { if (expired) { expired = false; return { status: 401, body: {} }; } return { body: { id: 42, name: 'Emma Testesen' } }; }],
    [/^GET \/api\/v1\/courses\?/, () => ({ body: [{ id: 7, name: 'Norsk 2STA', course_code: 'NOR1260' }] })],
    [/^GET \/api\/v1\/courses\/7\/assignments/, () => ({ body: [
      { id: 1, name: 'Novelleanalyse', due_at: '2026-11-20T22:59:00Z', html_url: 'https://skole.instructure.com/courses/7/assignments/1', submission: { workflow_state: 'unsubmitted' } },
      { id: 2, name: 'Fagtekst', due_at: '2026-11-01T22:59:00Z', html_url: 'https://skole.instructure.com/courses/7/assignments/2', submission: { workflow_state: 'unsubmitted', missing: true } },
      { id: 3, name: 'Kortsvar uke 40', due_at: '2026-10-02T22:59:00Z', html_url: 'https://skole.instructure.com/courses/7/assignments/3', submission: { workflow_state: 'graded', grade: '5', score: 17, submitted_at: '2026-10-01T10:00:00Z' }, points_possible: 20 },
      { id: 4, name: 'Quiz: retorikk', due_at: '2026-11-12T08:00:00Z', is_quiz_assignment: true, html_url: 'javascript:alert(1)', submission: { workflow_state: 'submitted', submitted_at: '2026-11-06T10:00:00Z' } },
      { id: 5, name: 'Upublisert', due_at: '2026-12-01T08:00:00Z', published: false },
    ] })],
    [/^GET \/api\/v1\/announcements/, () => ({ body: [{ id: 900, title: 'Husk ekskursjon', message: '<p>Ta med <b>matpakke</b>.</p>', posted_at: '2026-11-05T08:00:00Z', context_code: 'course_7', author: { display_name: 'Kari Lunde' }, html_url: 'https://skole.instructure.com/courses/7/discussion_topics/900' }] })],
    [/^GET \/api\/v1\/calendar_events/, () => ({ body: [{ id: 55, title: 'Foreldremøte', start_at: '2026-11-18T17:00:00Z', end_at: '2026-11-18T18:30:00Z', context_code: 'course_7' }] })],
    [/^GET \/api\/v1\/conversations/, () => (opts.failConversations ? { status: 403, body: {} } : { body: [{ id: 3, subject: 'Spørsmål om frist', last_message: 'Hei!', last_message_at: '2026-11-06T12:00:00Z', participants: [{ name: 'Kari Lunde' }] }] })],
  ];
};

// ---------------- OAuth og sikkerhet ----------------
test('Canvas: autorisasjons-URL følger dokumentasjonen og inneholder ingen hemmelighet', () => {
  const url = new URL(canvasModule.authorizeUrl({ env: canvasEnv, fetch, now: () => NOW }, { state: 'abc', redirectUri: 'https://skolehub.no/cb', codeChallenge: 'x' }));
  assert.equal(url.origin + url.pathname, 'https://skole.instructure.com/login/oauth2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'abc');
  assert.match(url.searchParams.get('scope')!, /url:GET\|\/api\/v1\/courses /);
  assert.doesNotMatch(url.toString(), /canvas-secret/);
});

test('Teams: PKCE S256, minste tillatelse som standard, karakterer kun ved opt-in', () => {
  const ctx = { env: msEnv, fetch, now: () => NOW };
  const url = new URL(teamsModule.authorizeUrl(ctx, { state: 's', redirectUri: 'https://skolehub.no/cb', codeChallenge: 'chal' }));
  assert.equal(url.host, 'login.microsoftonline.com');
  assert.equal(url.pathname, '/skole.no/oauth2/v2.0/authorize');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('scope')!, /EduAssignments\.ReadBasic/);
  assert.doesNotMatch(url.searchParams.get('scope')!, /ReadWrite|\.All/);
  assert.match(teamsModule.scopes({ ...msEnv, MS_INCLUDE_GRADES: 'true' }).join(' '), /EduAssignments\.Read\b/);
  assert.doesNotMatch(url.toString(), /ms-secret/);
});

test('OAuth-state: binder til bruker og tjeneste, avviser manipulasjon og utløp', () => {
  const s = createOAuthState('canvas', USER, KEY, NOW);
  assert.equal(verifyOAuthState(s.cookieValue, { state: s.state }, { platform: 'canvas', userId: USER }, KEY, NOW).platform, 'canvas');
  assert.throws(() => verifyOAuthState(s.cookieValue, { state: s.state }, { platform: 'canvas', userId: 'annen-bruker' }, KEY, NOW), /Feil bruker/);
  assert.throws(() => verifyOAuthState(s.cookieValue, { state: 'feil' }, { platform: 'canvas', userId: USER }, KEY, NOW), /State/);
  assert.throws(() => verifyOAuthState(s.cookieValue, { state: s.state }, { platform: 'teams', userId: USER }, KEY, NOW), /Feil bruker eller tjeneste/);
  assert.throws(() => verifyOAuthState(s.cookieValue, { state: s.state }, { platform: 'canvas', userId: USER }, KEY, NOW + 11 * 60_000), /Utløpt/);
  const mid = s.cookieValue.length - 30; // endre ett tegn midt i chifferteksten
  const tampered = s.cookieValue.slice(0, mid) + (s.cookieValue[mid] === 'A' ? 'B' : 'A') + s.cookieValue.slice(mid + 1);
  assert.throws(() => verifyOAuthState(tampered, { state: s.state }, { platform: 'canvas', userId: USER }, KEY, NOW), /Ugyldig/);
});

test('Tokens lagres kryptert og kan ikke flyttes til en annen bruker', () => {
  const t = { accessToken: 'hemmelig-token-123', refreshToken: 'r', expiresAt: NOW, scopes: [] };
  const enc = encryptTokens(t, KEY, USER, 'canvas');
  assert.doesNotMatch(enc.ciphertext, /hemmelig/);
  assert.equal(decryptTokens(enc.ciphertext, enc.iv, KEY, USER, 'canvas').accessToken, 'hemmelig-token-123');
  assert.throws(() => decryptTokens(enc.ciphertext, enc.iv, KEY, 'annen-bruker', 'canvas'));
  assert.throws(() => decryptTokens(enc.ciphertext, enc.iv, randomBytes(32).toString('base64'), USER, 'canvas'));
});

// ---------------- Canvas ende til ende (simulert) ----------------
test('Canvas: tilkobling, henting og status (levert / ikke levert / forfalt / vurdert)', async () => {
  const { f, calls } = fakeFetch(canvasRoutes());
  const d = deps(f, canvasEnv);
  const r = await completeConnection(d, canvasModule, USER, 'god-kode', 'ubrukt');
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = await d.store.get(USER, 'canvas');
  assert.equal(row!.status, 'tilkoblet');
  assert.doesNotMatch(JSON.stringify(row), /cv-access|cv-refresh/, 'token må ikke lagres i klartekst');
  const items = d.store.items.get(`${USER}|canvas`)!;
  const byTitle = (t: string) => items.find((i) => i.title === t)!;
  assert.equal(byTitle('Novelleanalyse').submissionStatus, 'ikke_levert');
  assert.equal(byTitle('Fagtekst').submissionStatus, 'forfalt');
  assert.equal(byTitle('Kortsvar uke 40').submissionStatus, 'vurdert');
  assert.equal(byTitle('Kortsvar uke 40').grade, '5');
  assert.equal(byTitle('Quiz: retorikk').kind, 'prove');
  assert.equal(byTitle('Quiz: retorikk').submissionStatus, 'levert');
  assert.equal(byTitle('Quiz: retorikk').url, null, 'bare https-lenker godtas');
  assert.equal(items.some((i) => i.title === 'Upublisert'), false);
  assert.equal(byTitle('Husk ekskursjon').body, 'Ta med matpakke.');
  assert.equal(byTitle('Foreldremøte').kind, 'hendelse');
  assert.equal(byTitle('Spørsmål om frist').kind, 'melding');
  // Token sendes bare i header, aldri i URL
  assert.ok(calls.filter((c) => c.url.includes('/api/v1/')).every((c) => c.auth === 'Bearer cv-access-1' && !c.url.includes('cv-access')));
});

test('Canvas: manglende tillatelse til én del gir advarsel, ikke total feil', async () => {
  const { f } = fakeFetch(canvasRoutes({ failConversations: true }));
  const d = deps(f, canvasEnv);
  const r = await completeConnection(d, canvasModule, USER, 'god-kode', 'x');
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, ['Meldinger: mangler tillatelse']);
  assert.match(d.store.rows.get(`${USER}|canvas`)!.lastError!, /Meldinger/);
});

test('Utløpt token fornyes automatisk; tilbakekalt token gir «Tilkobling feilet»', async () => {
  const { f, calls } = fakeFetch(canvasRoutes({ expireOnce: true }));
  const d = deps(f, canvasEnv);
  await completeConnection(d, canvasModule, USER, 'god-kode', 'x'); // 401 første gang => refresh => ok
  assert.ok(calls.some((c) => c.method === 'POST' && c.body.includes('grant_type=refresh_token')));
  assert.equal((await d.store.get(USER, 'canvas'))!.status, 'tilkoblet');

  // Lagre en tilgang med ugyldig refresh token og utløpt access token
  const bad = encryptTokens({ accessToken: 'gammel', refreshToken: 'tilbakekalt', expiresAt: NOW - 1000, scopes: [] }, KEY, USER, 'canvas');
  await d.store.save(USER, 'canvas', { tokenCiphertext: bad.ciphertext, tokenIv: bad.iv });
  const r = await syncConnection(d, canvasModule, USER);
  assert.equal(r.ok, false);
  assert.equal(r.status, 'feilet');
  assert.equal(r.errorCode, 'TOKEN_EXPIRED');
  assert.match(d.store.rows.get(`${USER}|canvas`)!.lastError!, /Koble til på nytt/);
});

test('Ugyldig engangskode gir feilet tilkobling uten lagret token', async () => {
  const { f } = fakeFetch(canvasRoutes());
  const d = deps(f, canvasEnv);
  const r = await completeConnection(d, canvasModule, USER, 'feil-kode', 'x');
  assert.equal(r.status, 'feilet');
  assert.equal((await d.store.get(USER, 'canvas'))!.tokenCiphertext ?? null, null);
});

test('Koble fra: tilbakekaller hos Canvas og sletter tokens og data', async () => {
  const { f, calls } = fakeFetch(canvasRoutes());
  const d = deps(f, canvasEnv);
  await completeConnection(d, canvasModule, USER, 'god-kode', 'x');
  await disconnect(d, canvasModule, USER);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/login/oauth2/token')));
  assert.equal(await d.store.get(USER, 'canvas'), null);
  assert.equal(d.store.items.has(`${USER}|canvas`), false);
});

test('API-begrensning: Retry-After respekteres, vedvarende 429 endrer ikke status til feilet', async () => {
  let n = 0;
  const routes = canvasRoutes();
  routes.unshift([/^GET \/api\/v1\/courses\?/, () => (n++ < 1 ? { status: 429, headers: { 'retry-after': '0' }, body: {} } : { body: [] })]);
  const { f } = fakeFetch(routes);
  const d = deps(f, canvasEnv);
  assert.equal((await completeConnection(d, canvasModule, USER, 'god-kode', 'x')).ok, true);

  const always429 = canvasRoutes();
  always429.unshift([/^GET \/api\/v1\/courses\?/, () => ({ status: 429, headers: { 'retry-after': '0' }, body: {} })]);
  const d2 = deps(fakeFetch(always429).f, canvasEnv, d.store);
  const r = await syncConnection(d2, canvasModule, USER);
  assert.equal(r.errorCode, 'RATE_LIMITED');
  assert.equal(r.status, 'tilkoblet');
});

// ---------------- Teams (simulert Graph) ----------------
const graphRoutes = (opts: { consent?: boolean } = {}): [RegExp, Handler][] => [
  [/^POST \/skole\.no\/oauth2\/v2\.0\/token/, (_u, init) => {
    const p = new URLSearchParams(String(init.body));
    if (opts.consent) return { status: 400, body: { error: 'invalid_grant', error_description: 'AADSTS65001: The user or administrator has not consented' } };
    assert.ok(p.get('code_verifier'), 'PKCE-verifier må sendes');
    return { body: { access_token: 'ms-access', refresh_token: 'ms-refresh', expires_in: 3600, scope: 'User.Read EduAssignments.ReadBasic EduRoster.ReadBasic' } };
  }],
  [/^GET \/v1\.0\/me\?/, () => ({ body: { id: 'aad-1', displayName: 'Emma Testesen' } })],
  [/^GET \/v1\.0\/education\/me\/classes/, () => ({ body: { value: [{ id: 'c1', displayName: 'Norsk 2STA' }, { id: 'c2', displayName: 'Matematikk R1' }] } })],
  [/^GET \/v1\.0\/education\/me\/assignments/, () => ({ body: { value: [
    { id: 'a1', classId: 'c1', displayName: 'Novelleanalyse', status: 'assigned', dueDateTime: '2026-11-20T22:59:00Z', webUrl: 'https://teams.microsoft.com/l/entity/x', submissions: [{ id: 's1', status: 'working' }] },
    { id: 'a2', classId: 'c2', displayName: 'Kapittelprøve vektorer', status: 'assigned', dueDateTime: '2026-11-25T07:30:00Z', submissions: [{ id: 's2', status: 'submitted' }] },
    { id: 'a3', classId: 'c2', displayName: 'Oppgavesett 3', status: 'assigned', dueDateTime: '2026-11-02T22:59:00Z', submissions: [{ id: 's3', status: 'working' }] },
    { id: 'a4', classId: 'c2', displayName: 'Utkast', status: 'draft', dueDateTime: '2026-12-02T22:59:00Z' },
  ] } })],
];

test('Teams: PKCE-innlogging, klasser og oppgaver med innleveringsstatus', async () => {
  const { f } = fakeFetch(graphRoutes());
  const d = deps(f, msEnv);
  const r = await completeConnection(d, teamsModule, USER, 'kode', 'verifier-123');
  assert.equal(r.ok, true, JSON.stringify(r));
  const items = d.store.items.get(`${USER}|teams`)!;
  const t = (x: string) => items.find((i) => i.title === x)!;
  assert.equal(t('Novelleanalyse').submissionStatus, 'ikke_levert');
  assert.equal(t('Novelleanalyse').courseName, 'Norsk 2STA');
  assert.equal(t('Kapittelprøve vektorer').kind, 'prove');
  assert.equal(t('Kapittelprøve vektorer').submissionStatus, 'levert');
  assert.equal(t('Oppgavesett 3').submissionStatus, 'forfalt');
  assert.equal(items.some((i) => i.title === 'Utkast'), false);
  assert.equal(items.filter((i) => i.kind === 'fag').length, 2);
  assert.equal(d.store.rows.get(`${USER}|teams`)!.accountLabel, 'Emma Testesen');
});

test('Teams: manglende administratorsamtykke gir forståelig feil', async () => {
  const d = deps(fakeFetch(graphRoutes({ consent: true })).f, msEnv);
  const r = await completeConnection(d, teamsModule, USER, 'kode', 'v');
  assert.equal(r.status, 'feilet');
  assert.equal(r.errorCode, 'CONSENT_REQUIRED');
  assert.match(r.message!, /IT-administrator må godkjenne/);
});

// ---------------- iSkole og manglende oppsett ----------------
test('iSkole later ikke som det kan kobles til', async () => {
  const cfg = iskoleModule.configured({});
  assert.equal(cfg.ok, false);
  assert.equal(cfg.reason, 'NO_OFFICIAL_ACCESS');
  const r = await syncConnection(deps(fetch, { TOKEN_ENCRYPTION_KEY: KEY }), iskoleModule, USER);
  assert.equal(r.ok, false);
  assert.equal(r.status, 'ikke_tilkoblet');
  assert.throws(() => iskoleModule.authorizeUrl({} as ProviderContext, { state: '', redirectUri: '', codeChallenge: '' }));
});

test('Canvas uten nøkler fra skolen: «Ikke tilkoblet» med liste over hva som mangler', async () => {
  const cfg = canvasModule.configured({});
  assert.deepEqual(cfg.missing, ['CANVAS_BASE_URL', 'CANVAS_CLIENT_ID', 'CANVAS_CLIENT_SECRET']);
  const r = await syncConnection(deps(fetch, {}), canvasModule, USER);
  assert.equal(r.status, 'ikke_tilkoblet');
  assert.match(r.message!, /ikke satt opp/);
});

test('Canvas-status: forfalt bare når fristen har gått ut', () => {
  assert.equal(canvasSubmissionStatus({ id: 1, name: 'x', due_at: '2026-11-08T10:00:00Z', submission: { workflow_state: 'unsubmitted' } }, NOW), 'ikke_levert');
  assert.equal(canvasSubmissionStatus({ id: 1, name: 'x', due_at: '2026-11-06T10:00:00Z', submission: { workflow_state: 'unsubmitted' } }, NOW), 'forfalt');
  assert.equal(canvasSubmissionStatus({ id: 1, name: 'x', due_at: null, submission: null }, NOW), null);
});
