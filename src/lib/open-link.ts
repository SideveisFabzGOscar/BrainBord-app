import { bestLink, resolveLink, type LinkEnv, type LinkKind, type LinkPlatform, type OpenLink } from './links';

/** Felles form for kildeoppslag (TaskInput og SourceRef har disse feltene) */
export interface LinkSource { url: string | null; platform?: LinkPlatform; linkKind?: LinkKind | null; internalUrl?: string | null }

/**
 * Velger hvor «Åpne»-knappen skal gå: direkte lenke i kildesystemet > faget > systemets startside.
 * Finnes ingen ekstern lenke, vises oppgaven i Brainbord med forklaring. Ren funksjon (testes).
 */
export function openFor(sources: LinkSource[], isTest: boolean, env: LinkEnv): OpenLink | null {
  const external = bestLink(sources.map((s) => (s.platform && s.platform !== 'skolehub'
    ? resolveLink({ platform: s.platform, url: s.url, kind: s.linkKind ?? null }, isTest, env) : null)));
  if (external) return external;
  const internal = sources.find((s) => s.internalUrl);
  if (!internal?.internalUrl) return null;
  const via = sources.find((s) => s.platform && s.platform !== 'skolehub')?.platform;
  return { href: internal.internalUrl, kind: 'intern', platform: 'skolehub', external: false, label: 'Vis i Brainbord',
    note: via ? `${via === 'iskole' ? 'iSkole' : via} gir ingen direkte lenke til denne. Detaljene vises i Brainbord.` : null };
}

export function openForItem(r: { platform: LinkPlatform; url: string | null; link_kind: LinkKind | null; course_url: string | null; kind: string },
  env: LinkEnv): OpenLink | null {
  const l = resolveLink({ platform: r.platform, url: r.url, kind: r.link_kind }, false, env, r.course_url);
  return l && l.kind === 'direkte' && r.kind !== 'oppgave' && r.kind !== 'prove' ? { ...l, label: `Åpne i ${r.platform === 'teams' ? 'Teams' : 'Canvas'}` } : l;
}
