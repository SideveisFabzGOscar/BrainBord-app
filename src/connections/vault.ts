import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ConnError, type ConnPlatform, type TokenSet } from './types';

/**
 * Kryptering av OAuth-tokens (AES-256-GCM) og forseglet OAuth-state.
 * Nøkkelen (TOKEN_ENCRYPTION_KEY, 32 byte base64) finnes bare i servermiljøet.
 * Tokens havner aldri i frontend, URL-er eller logger.
 */
function keyFrom(b64: string | undefined): Buffer {
  if (!b64) throw new ConnError('NOT_CONFIGURED', 'TOKEN_ENCRYPTION_KEY mangler');
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new ConnError('NOT_CONFIGURED', 'TOKEN_ENCRYPTION_KEY må være 32 byte (base64)');
  return k;
}

function seal(plain: string, keyB64: string | undefined, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(keyB64), iv);
  c.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);
  return { ciphertext: enc.toString('base64'), iv: iv.toString('base64') };
}
function open(ciphertext: string, ivB64: string, keyB64: string | undefined, aad: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const d = createDecipheriv('aes-256-gcm', keyFrom(keyB64), Buffer.from(ivB64, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8');
}

/** AAD binder chifferteksten til bruker og plattform: et token kan ikke flyttes til en annen bruker. */
export const encryptTokens = (t: TokenSet, keyB64: string | undefined, userId: string, platform: ConnPlatform) =>
  seal(JSON.stringify(t), keyB64, `tokens|${userId}|${platform}`);
export function decryptTokens(ciphertext: string, iv: string, keyB64: string | undefined, userId: string, platform: ConnPlatform): TokenSet {
  try { return JSON.parse(open(ciphertext, iv, keyB64, `tokens|${userId}|${platform}`)); }
  catch { throw new ConnError('TOKEN_EXPIRED', 'Lagret tilgang kunne ikke leses'); }
}

// ---------- PKCE og OAuth-state ----------
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function pkcePair() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

export interface OAuthState { platform: ConnPlatform; userId: string; state: string; verifier: string; exp: number }
export const STATE_COOKIE = 'skolehub_oauth';

export function createOAuthState(platform: ConnPlatform, userId: string, keyB64: string | undefined, now = Date.now()) {
  const { verifier, challenge } = pkcePair();
  const st: OAuthState = { platform, userId, state: b64url(randomBytes(24)), verifier, exp: now + 10 * 60_000 };
  const { ciphertext, iv } = seal(JSON.stringify(st), keyB64, 'oauth-state');
  return { cookieValue: `${iv}.${ciphertext}`, state: st.state, challenge };
}

/** Validerer callback: riktig bruker, plattform, state (konstant-tid sammenligning) og ikke utløpt. */
export function verifyOAuthState(cookieValue: string | undefined, query: { state?: string | null },
  expected: { platform: ConnPlatform; userId: string }, keyB64: string | undefined, now = Date.now()): OAuthState {
  if (!cookieValue || !query.state) throw new ConnError('INVALID_STATE', 'Mangler state');
  let st: OAuthState;
  try { const [iv, ct] = cookieValue.split('.'); st = JSON.parse(open(ct, iv, keyB64, 'oauth-state')); }
  catch { throw new ConnError('INVALID_STATE', 'Ugyldig state'); }
  const a = Buffer.from(st.state), b = Buffer.from(query.state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ConnError('INVALID_STATE', 'State stemmer ikke');
  if (st.platform !== expected.platform || st.userId !== expected.userId) throw new ConnError('INVALID_STATE', 'Feil bruker eller tjeneste');
  if (st.exp < now) throw new ConnError('INVALID_STATE', 'Utløpt');
  return st;
}
