/**
 * Personlige tilkoblinger: hver bruker kobler sin EGEN konto via
 * offisiell OAuth 2.0. Én modul per tjeneste (canvas.ts, teams.ts, iskole.ts).
 */

export type ConnPlatform = 'canvas' | 'teams' | 'iskole';
export type ConnStatus = 'ikke_tilkoblet' | 'tilkoblet' | 'feilet';
export type ItemKind = 'oppgave' | 'prove' | 'kunngjoring' | 'fag' | 'hendelse' | 'melding';
export type SubmissionStatus = 'levert' | 'ikke_levert' | 'forfalt' | 'vurdert';

export type ConnErrorCode =
  | 'NOT_CONFIGURED' | 'NO_OFFICIAL_ACCESS' | 'TOKEN_EXPIRED' | 'FORBIDDEN' | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED' | 'UPSTREAM' | 'INVALID_STATE' | 'ACCESS_DENIED';

export class ConnError extends Error {
  constructor(public code: ConnErrorCode, message: string) { super(message); this.name = 'ConnError'; }
}

/** Brukervennlige feilmeldinger. Inneholder aldri tokens eller tekniske detaljer. */
export const ERROR_TEXT: Record<ConnErrorCode, string> = {
  NOT_CONFIGURED: 'Tjenesten er ikke satt opp av skolen ennå. Skolens IT må registrere Brainbord hos leverandøren.',
  NO_OFFICIAL_ACCESS: 'Leverandøren tilbyr ikke en offentlig tilgang for elever. Skolen må inngå avtale med leverandøren.',
  TOKEN_EXPIRED: 'Tilgangen har utløpt. Koble til på nytt.',
  FORBIDDEN: 'Brainbord mangler tillatelse til å lese disse dataene. Koble til på nytt og godkjenn tilgangen, eller kontakt skolens IT.',
  CONSENT_REQUIRED: 'Skolens IT-administrator må godkjenne Brainbord før elever kan koble til.',
  RATE_LIMITED: 'Tjenesten begrenser antall forespørsler akkurat nå. Prøv igjen om noen minutter.',
  UPSTREAM: 'Tjenesten svarte ikke som forventet. Prøv igjen senere.',
  INVALID_STATE: 'Innloggingen kunne ikke bekreftes (utløpt eller ugyldig). Start tilkoblingen på nytt.',
  ACCESS_DENIED: 'Du avbrøt eller avslo tilgangen. Ingenting ble koblet til.',
};

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: number;          // ms epoch
  scopes: string[];
}

export interface PersonalItem {
  kind: ItemKind;
  externalId: string;
  courseId?: string | null;
  courseName?: string | null;
  title: string;
  body?: string | null;
  author?: string | null;
  dueAt?: string | null;
  endsAt?: string | null;
  publishedAt?: string | null;
  /** Original lenke fra API-et (Canvas html_url, Graph webUrl). Aldri konstruert. */
  url?: string | null;
  linkKind?: 'direkte' | 'fag' | 'system' | null;
  courseUrl?: string | null;
  submissionStatus?: SubmissionStatus | null;
  /** Når eleven leverte i kildesystemet */
  submittedAt?: string | null;
  grade?: string | null;
  score?: number | null;
  pointsPossible?: number | null;
}

export interface FetchResult {
  items: PersonalItem[];
  accountLabel: string | null;
  externalUserId: string | null;
  /** Deler som ikke kunne hentes (f.eks. manglende tillatelse til kunngjøringer) */
  warnings: string[];
}

export interface ProviderContext {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => number;
}

export interface ProviderModule {
  platform: ConnPlatform;
  label: string;
  /** Hva brukeren får se fra denne tjenesten */
  provides: string[];
  /** Hva som ikke er mulig via offisiell tilgang */
  limitations: string[];
  docsUrl: string;
  configured(env: ProviderContext['env']): { ok: boolean; missing: string[]; reason?: ConnErrorCode };
  scopes(env: ProviderContext['env']): string[];
  authorizeUrl(ctx: ProviderContext, p: { state: string; redirectUri: string; codeChallenge: string }): string;
  exchangeCode(ctx: ProviderContext, p: { code: string; redirectUri: string; codeVerifier: string }): Promise<TokenSet>;
  refresh(ctx: ProviderContext, tokens: TokenSet, redirectUri: string): Promise<TokenSet>;
  revoke(ctx: ProviderContext, tokens: TokenSet): Promise<void>;
  fetchData(ctx: ProviderContext, accessToken: string): Promise<FetchResult>;
}
