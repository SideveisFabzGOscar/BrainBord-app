/**
 * Direkte lenker til kildesystemet.
 * Regler:
 *  - Bare URL-er som kom fra leverandørens API (eller skolens import) brukes. Ingenting konstrueres.
 *  - Lenken må være https og peke til riktig systems domene (hindrer at en manipulert oppgave
 *    sender eleven til en falsk innloggingsside).
 *  - Finnes ikke direkte lenke, brukes faget eller systemets startside, med en forklaring.
 */
export type LinkPlatform = 'canvas' | 'teams' | 'iskole' | 'itslearning' | 'skolehub';
export type LinkKind = 'direkte' | 'fag' | 'system';

export interface LinkCandidate { platform: LinkPlatform; url: string | null; kind: LinkKind | null }
export interface OpenLink { href: string; kind: LinkKind | 'intern'; platform: LinkPlatform; label: string; note: string | null; external: boolean }

export const PLATFORM_NAME: Record<LinkPlatform, string> = {
  canvas: 'Canvas', teams: 'Teams', iskole: 'iSkole', itslearning: 'itslearning', skolehub: 'Brainbord',
};

export interface LinkEnv { CANVAS_BASE_URL?: string; ISKOLE_PORTAL_URL?: string; ITSLEARNING_PORTAL_URL?: string }

const hostOf = (u?: string) => { try { return u ? new URL(u).host.toLowerCase() : null; } catch { return null; } };

/** Er URL-en en trygg https-lenke til riktig system? */
export function isTrustedUrl(platform: LinkPlatform, url: string | null | undefined, env: LinkEnv): boolean {
  if (!url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.host.toLowerCase();
  switch (platform) {
    case 'canvas': {
      const cfg = hostOf(env.CANVAS_BASE_URL);
      return cfg ? h === cfg : h.endsWith('.instructure.com');
    }
    case 'teams': return h === 'teams.microsoft.com' || h === 'teams.cloud.microsoft';
    case 'iskole': { const cfg = hostOf(env.ISKOLE_PORTAL_URL); return cfg ? h === cfg : false; }
    case 'itslearning': { const cfg = hostOf(env.ITSLEARNING_PORTAL_URL); return cfg ? h === cfg : h.endsWith('.itslearning.com'); }
    default: return false;
  }
}

/** Systemets startside – brukes bare når verken oppgave- eller faglenke finnes */
export function systemHome(platform: LinkPlatform, env: LinkEnv): string | null {
  if (platform === 'canvas') return env.CANVAS_BASE_URL && isTrustedUrl('canvas', env.CANVAS_BASE_URL, env) ? env.CANVAS_BASE_URL : null;
  if (platform === 'teams') return 'https://teams.microsoft.com/';
  if (platform === 'iskole') return env.ISKOLE_PORTAL_URL && isTrustedUrl('iskole', env.ISKOLE_PORTAL_URL, env) ? env.ISKOLE_PORTAL_URL : null;
  if (platform === 'itslearning') return env.ITSLEARNING_PORTAL_URL ?? null;
  return null;
}

const NOTES: Record<LinkKind, (p: string) => string | null> = {
  direkte: (p) => (p === 'Teams' ? 'Åpnes i Teams. Du må være logget inn med skolekontoen.' : null),
  fag: (p) => `${p} har ikke en egen lenke til denne oppgaven, så faget åpnes. Finn oppgaven der.`,
  system: (p) => `${p} gir ikke en direkte lenke til denne oppgaven. Startsiden åpnes; finn oppgaven der.`,
};

export function resolveLink(c: LinkCandidate, isTest: boolean, env: LinkEnv, courseUrl?: string | null): OpenLink | null {
  const name = PLATFORM_NAME[c.platform];
  if (c.url && isTrustedUrl(c.platform, c.url, env)) {
    const kind = c.kind ?? 'direkte';
    return { href: c.url, kind, platform: c.platform, external: true, note: NOTES[kind](name),
      label: kind === 'direkte' ? (isTest ? 'Åpne prøve' : 'Åpne oppgave') : kind === 'fag' ? `Åpne faget i ${name}` : `Åpne ${name}` };
  }
  if (courseUrl && isTrustedUrl(c.platform, courseUrl, env)) {
    return { href: courseUrl, kind: 'fag', platform: c.platform, external: true, label: `Åpne faget i ${name}`, note: NOTES.fag(name) };
  }
  const home = systemHome(c.platform, env);
  if (home) return { href: home, kind: 'system', platform: c.platform, external: true, label: `Åpne ${name}`, note: NOTES.system(name) };
  return null;
}

const RANK: Record<string, number> = { direkte: 3, fag: 2, system: 1, intern: 0 };
/** Velg den beste lenken blant kildene: direkte > fag > startside */
export function bestLink(links: (OpenLink | null)[]): OpenLink | null {
  return links.filter((l): l is OpenLink => !!l).sort((a, b) => RANK[b.kind] - RANK[a.kind])[0] ?? null;
}

/** Leses på serveren. Ingen hemmeligheter, bare offentlige adresser til skolens systemer. */
export const linkEnv = (): LinkEnv => ({
  CANVAS_BASE_URL: process.env.CANVAS_BASE_URL, ISKOLE_PORTAL_URL: process.env.ISKOLE_PORTAL_URL,
  ITSLEARNING_PORTAL_URL: process.env.ITSLEARNING_PORTAL_URL,
});
