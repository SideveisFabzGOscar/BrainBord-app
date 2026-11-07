import { IntegrationError, type Logger } from './types';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * JSON-forespørsel med feilhåndtering:
 *  - 401/403 => AUTH_FAILED (ikke nytt forsøk)
 *  - 429/5xx => nytt forsøk med eksponentiell backoff (respekterer Retry-After)
 */
export async function requestJson<T = unknown>(
  fetchImpl: typeof fetch,
  url: string,
  logger: Logger,
  opts: RequestOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const retries = opts.retries ?? 3;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let res: Response;
    try {
      res = await fetchImpl(url, { method: opts.method ?? 'GET', headers: opts.headers, body: opts.body });
    } catch (err) {
      if (attempt < retries) {
        attempt++;
        logger.warn(`Nettverksfeil, nytt forsøk ${attempt}/${retries}`, { url: redact(url) });
        await sleep(backoff(attempt));
        continue;
      }
      throw new IntegrationError('API_ERROR', `Nettverksfeil mot ${redact(url)}`, String(err));
    }
    if (res.ok) {
      const text = await res.text();
      try {
        return { data: (text ? JSON.parse(text) : null) as T, headers: res.headers };
      } catch {
        throw new IntegrationError('PARSE_ERROR', `Ugyldig JSON fra ${redact(url)}`);
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError('AUTH_FAILED', `Autentisering avvist (${res.status}) av ${hostOf(url)}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      attempt++;
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30_000) : backoff(attempt);
      logger.warn(`HTTP ${res.status}, venter ${wait} ms (forsøk ${attempt}/${retries})`, { url: redact(url) });
      await sleep(wait);
      continue;
    }
    throw new IntegrationError(res.status === 429 ? 'RATE_LIMITED' : 'API_ERROR',
      `HTTP ${res.status} fra ${redact(url)}`);
  }
}

/** OAuth 2.0 client credentials (brukes av Microsoft Graph m.fl.) */
export async function clientCredentialsToken(
  fetchImpl: typeof fetch, tokenUrl: string, clientId: string, clientSecret: string, scope: string, logger: Logger,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope,
  });
  const { data } = await requestJson<{ access_token?: string }>(fetchImpl, tokenUrl, logger, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, retries: 1,
  });
  if (!data?.access_token) throw new IntegrationError('AUTH_FAILED', 'Mottok ikke access_token');
  return data.access_token;
}

/** Leser rel="next" fra Link-header (Canvas-paginering) */
export function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m) return m[1];
  }
  return null;
}

const backoff = (attempt: number) => Math.min(250 * 2 ** attempt, 8000);
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return 'ukjent vert'; } };
/** Fjerner query-parametere fra logger (kan inneholde tokens) */
export const redact = (url: string) => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; } };
