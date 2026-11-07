import { apiGet, nextLink, safeHttpsUrl, stripHtml, tokenRequest } from './http';
import { ConnError, type FetchResult, type PersonalItem, type ProviderContext, type ProviderModule, type SubmissionStatus, type TokenSet } from './types';

/**
 * Canvas LMS – offisiell OAuth 2.0 (Instructure).
 * Krever en "Developer Key" opprettet av skolens Canvas-administrator med
 * redirect-URI <APP_URL>/api/connect/canvas/callback.
 * Dokumentasjon: https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth_endpoints
 */

/** Minste sett med lesetilganger (brukes når developer key håndhever scopes) */
export const CANVAS_DEFAULT_SCOPES = [
  'url:GET|/api/v1/users/:id',
  'url:GET|/api/v1/courses',
  'url:GET|/api/v1/courses/:course_id/assignments',
  'url:GET|/api/v1/announcements',
  'url:GET|/api/v1/calendar_events',
  'url:GET|/api/v1/conversations',
];

const base = (env: ProviderContext['env']) => String(env.CANVAS_BASE_URL ?? '').replace(/\/$/, '');

interface CanvasSubmission { workflow_state?: string; submitted_at?: string | null; missing?: boolean; late?: boolean; excused?: boolean; grade?: string | null; score?: number | null }
interface CanvasAssignment { id: number; name: string; description?: string | null; due_at?: string | null; html_url?: string; points_possible?: number | null;
  is_quiz_assignment?: boolean; submission_types?: string[]; published?: boolean; submission?: CanvasSubmission | null }

export function canvasSubmissionStatus(a: CanvasAssignment, now: number): SubmissionStatus | null {
  const s = a.submission;
  if (!s) return null; // ikke student i emnet
  if (s.excused) return 'levert';
  if (s.workflow_state === 'graded' && (s.grade != null || s.score != null)) return 'vurdert';
  if (s.submitted_at || s.workflow_state === 'submitted' || s.workflow_state === 'pending_review') return 'levert';
  if (s.missing || (a.due_at && Date.parse(a.due_at) < now)) return 'forfalt';
  return 'ikke_levert';
}

async function pages<T>(ctx: ProviderContext, url: string, token: string, max = 10): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  for (let i = 0; next && i < max; i++) {
    const { data, headers }: { data: T[]; headers: Headers } = await apiGet<T[]>(ctx.fetch, next, token);
    out.push(...(Array.isArray(data) ? data : []));
    next = nextLink(headers.get('link'));
    // Følg bare lenker til samme Canvas-instans
    if (next && !next.startsWith(base(ctx.env))) next = null;
  }
  return out;
}

export const canvasModule: ProviderModule = {
  platform: 'canvas',
  label: 'Canvas LMS',
  provides: ['Fag (emner)', 'Oppgaver og frister', 'Innleveringsstatus', 'Prøver (quiz) og karakterer/poeng', 'Kunngjøringer', 'Kalenderhendelser', 'Meldinger (innboks)'],
  limitations: ['Fravær og timeplan finnes ikke i Canvas.', 'Karakterer vises bare når læreren har publisert dem i Canvas.'],
  docsUrl: 'https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth',

  configured(env) {
    const missing = ['CANVAS_BASE_URL', 'CANVAS_CLIENT_ID', 'CANVAS_CLIENT_SECRET'].filter((k) => !env[k]);
    if (env.CANVAS_BASE_URL && !/^https:\/\//.test(env.CANVAS_BASE_URL)) missing.push('CANVAS_BASE_URL må starte med https://');
    return { ok: missing.length === 0, missing, reason: missing.length ? 'NOT_CONFIGURED' : undefined };
  },

  scopes(env) {
    return env.CANVAS_SCOPES === 'none' ? [] : (env.CANVAS_SCOPES?.split(/\s+/).filter(Boolean) ?? CANVAS_DEFAULT_SCOPES);
  },

  authorizeUrl(ctx, { state, redirectUri }) {
    const u = new URL(`${base(ctx.env)}/login/oauth2/auth`);
    u.searchParams.set('client_id', ctx.env.CANVAS_CLIENT_ID!);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('purpose', 'Brainbord');
    const scopes = this.scopes(ctx.env);
    if (scopes.length) u.searchParams.set('scope', scopes.join(' '));
    return u.toString();
  },

  async exchangeCode(ctx, { code, redirectUri }) {
    const j = await tokenRequest(ctx.fetch, `${base(ctx.env)}/login/oauth2/token`, {
      grant_type: 'authorization_code', client_id: ctx.env.CANVAS_CLIENT_ID!, client_secret: ctx.env.CANVAS_CLIENT_SECRET!,
      redirect_uri: redirectUri, code,
    });
    if (typeof j.access_token !== 'string') throw new ConnError('UPSTREAM', 'Mangler access_token');
    return { accessToken: j.access_token, refreshToken: (j.refresh_token as string) ?? null,
      expiresAt: ctx.now() + Number(j.expires_in ?? 3600) * 1000, scopes: this.scopes(ctx.env) };
  },

  async refresh(ctx, tokens, redirectUri) {
    if (!tokens.refreshToken) throw new ConnError('TOKEN_EXPIRED', 'Ingen refresh token');
    const j = await tokenRequest(ctx.fetch, `${base(ctx.env)}/login/oauth2/token`, {
      grant_type: 'refresh_token', client_id: ctx.env.CANVAS_CLIENT_ID!, client_secret: ctx.env.CANVAS_CLIENT_SECRET!,
      redirect_uri: redirectUri, refresh_token: tokens.refreshToken,
    });
    if (typeof j.access_token !== 'string') throw new ConnError('TOKEN_EXPIRED', 'Fornyelse feilet');
    // Canvas returnerer ikke ny refresh token – den samme gjenbrukes
    return { ...tokens, accessToken: j.access_token, expiresAt: ctx.now() + Number(j.expires_in ?? 3600) * 1000 };
  },

  async revoke(ctx, tokens) {
    try {
      await ctx.fetch(`${base(ctx.env)}/login/oauth2/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    } catch { /* tokenet slettes hos oss uansett */ }
  },

  async fetchData(ctx, token): Promise<FetchResult> {
    const b = base(ctx.env);
    const now = ctx.now();
    const warnings: string[] = [];
    const items: PersonalItem[] = [];
    const optional = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch (e) {
        if (e instanceof ConnError && e.code === 'FORBIDDEN') { warnings.push(`${label}: mangler tillatelse`); return fallback; }
        throw e;
      }
    };

    const me = await optional('Profil', () => apiGet<{ id: number; name: string }>(ctx.fetch, `${b}/api/v1/users/self`, token).then((r) => r.data), null);
    const courses = await pages<{ id: number; name: string; course_code?: string }>(ctx, `${b}/api/v1/courses?enrollment_state=active&per_page=100`, token);
    for (const c of courses) {
      // Canvas' kurs-API gir ingen html_url, så vi lagrer ingen lenke for selve emnet
      items.push({ kind: 'fag', externalId: `course:${c.id}`, courseId: String(c.id), courseName: c.name, title: c.name, body: c.course_code ?? null });
      const assignments = await optional(`Oppgaver i ${c.name}`, () =>
        pages<CanvasAssignment>(ctx, `${b}/api/v1/courses/${c.id}/assignments?include[]=submission&per_page=100`, token), []);
      for (const a of assignments) {
        if (a.published === false) continue;
        const quiz = a.is_quiz_assignment || a.submission_types?.includes('online_quiz');
        items.push({
          kind: quiz ? 'prove' : 'oppgave', externalId: String(a.id), courseId: String(c.id), courseName: c.name,
          title: a.name, body: stripHtml(a.description), dueAt: a.due_at ?? null,
          url: safeHttpsUrl(a.html_url), linkKind: safeHttpsUrl(a.html_url) ? 'direkte' : 'system',
          submissionStatus: canvasSubmissionStatus(a, now), grade: a.submission?.grade ?? null, submittedAt: a.submission?.submitted_at ?? null,
          score: a.submission?.score ?? null, pointsPossible: a.points_possible ?? null,
        });
      }
    }

    const ctxCodes = courses.map((c) => `course_${c.id}`);
    const nameOf = (code: string) => courses.find((c) => `course_${c.id}` === code)?.name ?? null;
    for (let i = 0; i < ctxCodes.length; i += 10) {
      const codes = ctxCodes.slice(i, i + 10).map((c) => `context_codes[]=${encodeURIComponent(c)}`).join('&');
      const since = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);
      const ann = await optional('Kunngjøringer', () => pages<{ id: number; title: string; message?: string; posted_at?: string; html_url?: string;
        context_code?: string; author?: { display_name?: string } }>(ctx, `${b}/api/v1/announcements?${codes}&start_date=${since}&per_page=50`, token, 3), []);
      for (const a of ann) items.push({ kind: 'kunngjoring', externalId: String(a.id), courseName: a.context_code ? nameOf(a.context_code) : null,
        courseId: a.context_code?.replace('course_', '') ?? null, title: a.title, body: stripHtml(a.message), publishedAt: a.posted_at ?? null,
        author: a.author?.display_name ?? null, url: safeHttpsUrl(a.html_url), linkKind: a.html_url ? 'direkte' : 'system' });

      const until = new Date(now + 60 * 86_400_000).toISOString().slice(0, 10);
      const today = new Date(now).toISOString().slice(0, 10);
      const ev = await optional('Kalender', () => pages<{ id: number; title: string; start_at?: string; end_at?: string; html_url?: string;
        description?: string; context_code?: string; location_name?: string }>(ctx,
        `${b}/api/v1/calendar_events?type=event&${codes}&start_date=${today}&end_date=${until}&per_page=100`, token, 3), []);
      for (const e of ev) items.push({ kind: 'hendelse', externalId: String(e.id), courseName: e.context_code ? nameOf(e.context_code) : null,
        title: e.title, body: stripHtml(e.description) ?? e.location_name ?? null, dueAt: e.start_at ?? null, endsAt: e.end_at ?? null, url: safeHttpsUrl(e.html_url), linkKind: e.html_url ? 'direkte' : 'system' });
    }

    const conv = await optional('Meldinger', () => pages<{ id: number; subject?: string; last_message?: string; last_message_at?: string;
      context_name?: string; participants?: { name: string }[]; workflow_state?: string }>(ctx, `${b}/api/v1/conversations?per_page=30`, token, 1), []);
    for (const m of conv) items.push({ kind: 'melding', externalId: String(m.id), courseName: m.context_name ?? null,
      title: m.subject || '(uten emne)', body: m.last_message ?? null, publishedAt: m.last_message_at ?? null,
      // Samtale-API-et gir ingen lenke til den enkelte meldingen: vis Canvas-startsiden med forklaring
      author: m.participants?.slice(0, 3).map((p) => p.name).join(', ') ?? null, url: null, linkKind: 'system' });

    return { items, accountLabel: me?.name ?? null, externalUserId: me ? String(me.id) : null, warnings };
  },
};

export type { TokenSet };
