import Link from 'next/link';
import clsx from 'clsx';
import { ArrowUpRight, Info } from 'lucide-react';
import type { OpenLink } from '@/lib/links';

/**
 * «Åpne oppgave/prøve»: går rett til siden i kildesystemet (ny fane).
 * Viser forklaring når bare faget eller systemets startside er tilgjengelig.
 */
export function OpenButton({ link, size = 'md', showNote = true, className }: { link: OpenLink | null | undefined; size?: 'sm' | 'md'; showNote?: boolean; className?: string }) {
  if (!link) return <span className="text-xs text-muted">Ingen lenke tilgjengelig</span>;
  const cls = clsx(link.kind === 'direkte' ? 'btn-primary' : 'btn-outline', size === 'sm' && 'px-2.5 py-1 text-xs', className);
  const where = link.external ? ` (åpnes i ${link.platform === 'teams' ? 'Teams' : link.platform === 'canvas' ? 'Canvas' : link.platform === 'iskole' ? 'iSkole' : link.platform}, ny fane)` : '';
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {link.external ? (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${link.label}${where}`}>
          {link.label} <ArrowUpRight size={size === 'sm' ? 12 : 14} />
        </a>
      ) : (
        <Link href={link.href} className={cls}>{link.label}</Link>
      )}
      {showNote && link.note && link.kind !== 'direkte' && (
        <span className="flex max-w-xs gap-1 text-[11px] leading-snug text-muted"><Info size={11} className="mt-0.5 shrink-0" />{link.note}</span>
      )}
    </span>
  );
}
