import { ConnError } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * HTTP mot Canvas/Graph med tydelig feilklassifisering:
 *  401 => TOKEN_EXPIRED (kaller kan fornye token og prøve igjen)
 *  403 => FORBIDDEN (manglende tillatelse)
 *  429/503 => venter (Retry-After) og prøver igjen, deretter RATE_LIMITED/UPSTREAM
 * Token sendes kun i Authorization-header, aldri i URL. Feilmeldinger inneholder aldri token.
 */
export async function apiGet<T>(
  fetchImpl: typeof fetch, url: string, accessToken: string, opts: { retries?: number; maxWaitMs?: number } = {},
): Promise<{ data: T; headers: Headers }> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    } catch {
      if (attempt < retries) { await sleep(300 * 2 ** attempt); continue; }
      throw new ConnError('UPSTREAM', 'Nettverksfeil');
    }
    if (res.ok) {
      try { return { data: (await res.json()) as T, headers: res.headers }; }
      catch { throw new ConnError('UPSTREAM', 'Ugyldig svar fra tjenesten'); }
    }
    if (res.status === 401) throw new ConnError('TOKEN_EXPIRED', 'Token avvist');
    if (res.status === 403) throw new ConnError('FORBIDDEN', 'Mangler tillatelse');
    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt, opts.maxWaitMs ?? 10_000));
      continue;
    }
    throw new ConnError(res.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM', `HTTP ${res.status}`);
  }
}

/** Token-endepunkt (form-encoded). Returnerer JSON eller kaster uten å lekke hemmeligheter. */
export async function tokenRequest(fetchImpl: typeof fetch, url: string, body: Record<string, string>) {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body),
    });
  } catch { throw new ConnError('UPSTREAM', 'Nettverksfeil mot innlogging'); }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = String(json.error ?? '');
    const desc = String(json.error_description ?? '');
    if (/AADSTS65001|AADSTS90094|consent/i.test(desc) || err === 'consent_required') throw new ConnError('CONSENT_REQUIRED', 'Krever samtykke');
    if (err === 'invalid_grant') throw new ConnError('TOKEN_EXPIRED', 'Ugyldig eller utløpt kode/token');
    throw new ConnError('UPSTREAM', `Innlogging feilet (${res.status})`);
  }
  return json;
}

/** Følger Link: rel="next" (Canvas) med tak på antall sider */
export function nextLink(h: string | null): string | null {
  if (!h) return null;
  for (const part of h.split(',')) { const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/); if (m) return m[1]; }
  return null;
}

export function safeHttpsUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try { const x = new URL(u); return x.protocol === 'https:' ? x.toString() : null; } catch { return null; }
}

export function stripHtml(html: unknown, max = 4000): string | null {
  if (typeof html !== 'string' || !html) return null;
  const t = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  return t ? (t.length > max ? t.slice(0, max - 1) + '…' : t) : null;
}
