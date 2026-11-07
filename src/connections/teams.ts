import { apiGet, safeHttpsUrl, stripHtml, tokenRequest } from './http';
import { ConnError, type FetchResult, type PersonalItem, type ProviderContext, type ProviderModule, type SubmissionStatus } from './types';

/**
 * Microsoft Teams for Education via Microsoft Graph Education API.
 * Innlogging: Microsoft identity platform (OAuth 2.0 authorization code + PKCE).
 * Brukeren logger inn hos Microsoft (med skolens tofaktor), aldri i Brainbord.
 *
 * VIKTIG: Edu-tillatelsene krever administratorsamtykke i skolens Entra ID
 * (EduAssignments.ReadBasic: "AdminConsentRequired: Yes"). Uten det får eleven
 * feilmelding om at samtykke kreves.
 * Docs: https://learn.microsoft.com/graph/api/educationuser-list-assignments
 */
const GRAPH = 'https://graph.microsoft.com/v1.0';
const tenant = (env: ProviderContext['env']) => encodeURIComponent(env.MS_TENANT_ID || 'organizations');
const authority = (env: ProviderContext['env']) => `https://login.microsoftonline.com/${tenant(env)}/oauth2/v2.0`;

export function teamsScopes(env: ProviderContext['env']): string[] {
  // Minste tilgang: ReadBasic gir oppgaver UTEN karakterer. Karakterer krever EduAssignments.Read (opt-in).
  return ['openid', 'offline_access', 'User.Read', 'EduRoster.ReadBasic',
    env.MS_INCLUDE_GRADES === 'true' ? 'EduAssignments.Read' : 'EduAssignments.ReadBasic'];
}

interface GraphSubmission { id: string; status?: string; submittedDateTime?: string | null; returnedDateTime?: string | null }
interface GraphAssignment { id: string; classId?: string; displayName: string; dueDateTime?: string | null; status?: string;
  webUrl?: string | null; instructions?: { content?: string } | null; grading?: { maxPoints?: number } | null; submissions?: GraphSubmission[] | null }

export function teamsSubmissionStatus(a: GraphAssignment, now: number, hasGrade: boolean): SubmissionStatus | null {
  const s = a.submissions?.[0];
  if (!s) return null;
  if (s.status === 'returned' && hasGrade) return 'vurdert';
  if (s.status === 'submitted' || s.status === 'returned' || s.status === 'excused') return 'levert';
  if (a.dueDateTime && Date.parse(a.dueDateTime) < now) return 'forfalt';
  return 'ikke_levert';
}

async function graphPages<T>(ctx: ProviderContext, url: string, token: string, max = 10): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  for (let i = 0; next && i < max; i++) {
    const { data }: { data: { value?: T[]; '@odata.nextLink'?: string } } = await apiGet(ctx.fetch, next, token);
    out.push(...(data?.value ?? []));
    next = data?.['@odata.nextLink'] ?? null;
    if (next && !next.startsWith('https://graph.microsoft.com/')) next = null;
  }
  return out;
}

export const teamsModule: ProviderModule = {
  platform: 'teams',
  label: 'Microsoft Teams for Education',
  provides: ['Klasser (fag)', 'Oppgaver og frister', 'Innleveringsstatus', 'Poeng/karakter (kun hvis skolen tillater EduAssignments.Read)'],
  limitations: [
    'Skolens IT må gi administratorsamtykke før elever kan koble til.',
    'Kunngjøringer i Teams-kanaler og chat hentes ikke: det krever tillatelser til å lese alle meldinger, som er mer enn nødvendig.',
    'Timeplan og fravær finnes ikke i Teams.',
  ],
  docsUrl: 'https://learn.microsoft.com/graph/api/educationuser-list-assignments',

  configured(env) {
    const missing = ['MS_CLIENT_ID', 'MS_CLIENT_SECRET'].filter((k) => !env[k]);
    return { ok: missing.length === 0, missing, reason: missing.length ? 'NOT_CONFIGURED' : undefined };
  },
  scopes: teamsScopes,

  authorizeUrl(ctx, { state, redirectUri, codeChallenge }) {
    const u = new URL(`${authority(ctx.env)}/authorize`);
    u.searchParams.set('client_id', ctx.env.MS_CLIENT_ID!);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_mode', 'query');
    u.searchParams.set('scope', teamsScopes(ctx.env).join(' '));
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  },

  async exchangeCode(ctx, { code, redirectUri, codeVerifier }) {
    const j = await tokenRequest(ctx.fetch, `${authority(ctx.env)}/token`, {
      grant_type: 'authorization_code', client_id: ctx.env.MS_CLIENT_ID!, client_secret: ctx.env.MS_CLIENT_SECRET!,
      code, redirect_uri: redirectUri, code_verifier: codeVerifier, scope: teamsScopes(ctx.env).join(' '),
    });
    if (typeof j.access_token !== 'string') throw new ConnError('UPSTREAM', 'Mangler access_token');
    return { accessToken: j.access_token, refreshToken: (j.refresh_token as string) ?? null,
      expiresAt: ctx.now() + Number(j.expires_in ?? 3600) * 1000, scopes: String(j.scope ?? '').split(' ').filter(Boolean) };
  },

  async refresh(ctx, tokens) {
    if (!tokens.refreshToken) throw new ConnError('TOKEN_EXPIRED', 'Ingen refresh token');
    const j = await tokenRequest(ctx.fetch, `${authority(ctx.env)}/token`, {
      grant_type: 'refresh_token', client_id: ctx.env.MS_CLIENT_ID!, client_secret: ctx.env.MS_CLIENT_SECRET!,
      refresh_token: tokens.refreshToken, scope: teamsScopes(ctx.env).join(' '),
    });
    if (typeof j.access_token !== 'string') throw new ConnError('TOKEN_EXPIRED', 'Fornyelse feilet');
    // Microsoft roterer refresh token – lagre den nye
    return { accessToken: j.access_token, refreshToken: (j.refresh_token as string) ?? tokens.refreshToken,
      expiresAt: ctx.now() + Number(j.expires_in ?? 3600) * 1000, scopes: String(j.scope ?? tokens.scopes.join(' ')).split(' ').filter(Boolean) };
  },

  // Microsoft har ikke et endepunkt for å trekke tilbake ett enkelt token uten å logge brukeren ut overalt.
  // Vi sletter tokenet hos oss; brukeren kan fjerne appen på https://myapps.microsoft.com.
  async revoke() { /* bevisst tom */ },

  async fetchData(ctx, token): Promise<FetchResult> {
    const now = ctx.now();
    const warnings: string[] = [];
    const items: PersonalItem[] = [];
    const me = (await apiGet<{ id: string; displayName?: string }>(ctx.fetch, `${GRAPH}/me?$select=id,displayName`, token)).data;

    let classes: { id: string; displayName: string }[] = [];
    try { classes = await graphPages(ctx, `${GRAPH}/education/me/classes?$select=id,displayName`, token); }
    catch (e) { if (e instanceof ConnError && e.code === 'FORBIDDEN') warnings.push('Klasser: mangler tillatelse'); else throw e; }
    const className = new Map(classes.map((c) => [c.id, c.displayName]));
    for (const c of classes) items.push({ kind: 'fag', externalId: `class:${c.id}`, courseId: c.id, courseName: c.displayName, title: c.displayName });

    const assignments = await graphPages<GraphAssignment>(ctx, `${GRAPH}/education/me/assignments?$expand=submissions`, token);
    const gradesAllowed = ctx.env.MS_INCLUDE_GRADES === 'true';
    let gradeLookups = 0;
    for (const a of assignments) {
      if (a.status && !['assigned', 'published'].includes(a.status)) continue;
      let grade: string | null = null, score: number | null = null;
      const sub = a.submissions?.[0];
      if (gradesAllowed && sub?.status === 'returned' && a.classId && gradeLookups++ < 50) {
        try {
          const { data } = await apiGet<{ value?: { '@odata.type'?: string; points?: { points?: number } }[] }>(ctx.fetch,
            `${GRAPH}/education/classes/${a.classId}/assignments/${a.id}/submissions/${sub.id}/outcomes`, token);
          const p = data.value?.find((o) => o['@odata.type']?.includes('Points'))?.points?.points;
          if (typeof p === 'number') { score = p; grade = a.grading?.maxPoints ? `${p}/${a.grading.maxPoints}` : String(p); }
        } catch (e) { if (!(e instanceof ConnError && e.code === 'FORBIDDEN')) throw e; }
      }
      items.push({
        kind: /prøve|test|quiz|eksamen/i.test(a.displayName) ? 'prove' : 'oppgave',
        externalId: a.id, courseId: a.classId ?? null, courseName: (a.classId && className.get(a.classId)) || null,
        title: a.displayName, body: stripHtml(a.instructions?.content), dueAt: a.dueDateTime ?? null,
        url: safeHttpsUrl(a.webUrl), linkKind: safeHttpsUrl(a.webUrl) ? 'direkte' : 'system',
        submissionStatus: teamsSubmissionStatus(a, now, score != null), grade, score, pointsPossible: a.grading?.maxPoints ?? null,
        submittedAt: sub?.submittedDateTime ?? null,
      });
    }

    // Listen /education/me/assignments returnerer ofte webUrl = null (dokumentert). Den offisielle
    // dyplenken hentes da fra GET /education/classes/{classId}/assignments/{id} (egenskapen webUrl).
    const missing = items.filter((i) => (i.kind === 'oppgave' || i.kind === 'prove') && !i.url && i.courseId)
      .sort((a, b) => Math.abs(Date.parse(a.dueAt ?? '') - now || 9e15) - Math.abs(Date.parse(b.dueAt ?? '') - now || 9e15))
      .slice(0, Number(ctx.env.MS_LINK_LOOKUPS ?? 80));
    let forbidden = false;
    for (const it of missing) {
      try {
        const { data } = await apiGet<{ webUrl?: string | null }>(ctx.fetch,
          `${GRAPH}/education/classes/${encodeURIComponent(it.courseId!)}/assignments/${encodeURIComponent(it.externalId)}?$select=id,webUrl`, token);
        const u = safeHttpsUrl(data.webUrl);
        if (u) { it.url = u; it.linkKind = 'direkte'; }
      } catch (e) {
        if (e instanceof ConnError && e.code === 'FORBIDDEN') { forbidden = true; break; }
        if (e instanceof ConnError && (e.code === 'RATE_LIMITED' || e.code === 'TOKEN_EXPIRED')) throw e;
        // 404 o.l.: behold uten direkte lenke
      }
    }
    if (forbidden) warnings.push('Direktelenker til oppgaver: mangler tillatelse');
    return { items, accountLabel: me.displayName ?? null, externalUserId: me.id, warnings };
  },
};
