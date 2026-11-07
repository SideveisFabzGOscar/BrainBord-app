import { canvasModule } from './canvas';
import { iskoleModule } from './iskole';
import { teamsModule } from './teams';
import { decryptTokens, encryptTokens } from './vault';
import {
  ConnError, ERROR_TEXT, type ConnErrorCode, type ConnPlatform, type ConnStatus, type PersonalItem, type ProviderContext, type ProviderModule, type TokenSet,
} from './types';

export const PROVIDERS: Record<ConnPlatform, ProviderModule> = { canvas: canvasModule, teams: teamsModule, iskole: iskoleModule };
export const getProvider = (p: string): ProviderModule | null => (PROVIDERS as Record<string, ProviderModule>)[p] ?? null;

export interface ConnectionRow {
  status: ConnStatus; tokenCiphertext: string | null; tokenIv: string | null; accessExpiresAt: string | null;
}
export interface ConnectionPatch {
  status?: ConnStatus; accountLabel?: string | null; externalUserId?: string | null; scopes?: string[];
  tokenCiphertext?: string | null; tokenIv?: string | null; accessExpiresAt?: string | null; connectedAt?: string | null;
  lastSyncedAt?: string | null; lastError?: string | null; errorCode?: string | null;
}
/** Lagringslag (Supabase med service role i produksjon, minne i tester) */
export interface ConnectionStore {
  get(userId: string, platform: ConnPlatform): Promise<ConnectionRow | null>;
  save(userId: string, platform: ConnPlatform, patch: ConnectionPatch): Promise<void>;
  replaceItems(userId: string, platform: ConnPlatform, items: PersonalItem[]): Promise<void>;
  remove(userId: string, platform: ConnPlatform): Promise<void>;
}

export interface Deps { ctx: ProviderContext; store: ConnectionStore; redirectUri: (p: ConnPlatform) => string }
export interface SyncOutcome { ok: boolean; status: ConnStatus; itemCount?: number; warnings?: string[]; errorCode?: ConnErrorCode; message?: string }

const key = (d: Deps) => d.ctx.env.TOKEN_ENCRYPTION_KEY;
const toConnError = (e: unknown) => (e instanceof ConnError ? e : new ConnError('UPSTREAM', 'Uventet feil'));

async function fail(d: Deps, userId: string, platform: ConnPlatform, e: ConnError, keepConnected = false): Promise<SyncOutcome> {
  const status: ConnStatus = keepConnected ? 'tilkoblet' : 'feilet';
  await d.store.save(userId, platform, { status, lastError: ERROR_TEXT[e.code], errorCode: e.code });
  return { ok: false, status, errorCode: e.code, message: ERROR_TEXT[e.code] };
}

/** Steg 2 i OAuth: bytt kode mot token, lagre kryptert, og hent data første gang */
export async function completeConnection(d: Deps, mod: ProviderModule, userId: string, code: string, codeVerifier: string): Promise<SyncOutcome> {
  try {
    const tokens = await mod.exchangeCode(d.ctx, { code, redirectUri: d.redirectUri(mod.platform), codeVerifier });
    const enc = encryptTokens(tokens, key(d), userId, mod.platform);
    await d.store.save(userId, mod.platform, {
      status: 'tilkoblet', tokenCiphertext: enc.ciphertext, tokenIv: enc.iv, scopes: tokens.scopes,
      accessExpiresAt: new Date(tokens.expiresAt).toISOString(), connectedAt: new Date(d.ctx.now()).toISOString(),
      lastError: null, errorCode: null,
    });
  } catch (e) {
    return fail(d, userId, mod.platform, toConnError(e));
  }
  return syncConnection(d, mod, userId);
}

async function validTokens(d: Deps, mod: ProviderModule, userId: string, row: ConnectionRow, force = false): Promise<TokenSet> {
  if (!row.tokenCiphertext || !row.tokenIv) throw new ConnError('TOKEN_EXPIRED', 'Ingen lagret tilgang');
  let t = decryptTokens(row.tokenCiphertext, row.tokenIv, key(d), userId, mod.platform);
  if (force || t.expiresAt - 60_000 < d.ctx.now()) {
    t = await mod.refresh(d.ctx, t, d.redirectUri(mod.platform));
    const enc = encryptTokens(t, key(d), userId, mod.platform);
    await d.store.save(userId, mod.platform, { tokenCiphertext: enc.ciphertext, tokenIv: enc.iv,
      accessExpiresAt: new Date(t.expiresAt).toISOString() });
    row.tokenCiphertext = enc.ciphertext; row.tokenIv = enc.iv;
  }
  return t;
}

/** Synkroniser brukerens egne data. Fornyer token automatisk ved utløp (én gang). */
export async function syncConnection(d: Deps, mod: ProviderModule, userId: string): Promise<SyncOutcome> {
  const cfg = mod.configured(d.ctx.env);
  if (!cfg.ok) return { ok: false, status: 'ikke_tilkoblet', errorCode: cfg.reason, message: ERROR_TEXT[cfg.reason ?? 'NOT_CONFIGURED'] };
  const row = await d.store.get(userId, mod.platform);
  if (!row || row.status === 'ikke_tilkoblet' || !row.tokenCiphertext) {
    return { ok: false, status: 'ikke_tilkoblet', message: 'Ikke tilkoblet. Trykk «Koble til» først.' };
  }
  try {
    let tokens = await validTokens(d, mod, userId, row);
    let result;
    try {
      result = await mod.fetchData(d.ctx, tokens.accessToken);
    } catch (e) {
      if (!(e instanceof ConnError && e.code === 'TOKEN_EXPIRED')) throw e;
      tokens = await validTokens(d, mod, userId, row, true); // tilbakekalt/utløpt før tiden: forny og prøv én gang til
      result = await mod.fetchData(d.ctx, tokens.accessToken);
    }
    await d.store.replaceItems(userId, mod.platform, result.items);
    await d.store.save(userId, mod.platform, {
      status: 'tilkoblet', accountLabel: result.accountLabel, externalUserId: result.externalUserId,
      lastSyncedAt: new Date(d.ctx.now()).toISOString(),
      lastError: result.warnings.length ? `Noe kunne ikke hentes: ${result.warnings.join('; ')}` : null,
      errorCode: result.warnings.length ? 'FORBIDDEN' : null,
    });
    return { ok: true, status: 'tilkoblet', itemCount: result.items.length, warnings: result.warnings };
  } catch (e) {
    const ce = toConnError(e);
    // Midlertidige problemer endrer ikke tilkoblingsstatus
    return fail(d, userId, mod.platform, ce, ce.code === 'RATE_LIMITED' || ce.code === 'UPSTREAM');
  }
}

/** Koble fra: tilbakekall hos leverandør der det støttes, slett tokens og alle hentede data */
export async function disconnect(d: Deps, mod: ProviderModule, userId: string): Promise<void> {
  const row = await d.store.get(userId, mod.platform);
  if (row?.tokenCiphertext && row.tokenIv) {
    try { await mod.revoke(d.ctx, decryptTokens(row.tokenCiphertext, row.tokenIv, key(d), userId, mod.platform)); } catch { /* slettes uansett */ }
  }
  await d.store.remove(userId, mod.platform);
}
