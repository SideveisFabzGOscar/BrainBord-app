import clsx from 'clsx';

const STYLE: Record<string, { label: string; cls: string }> = {
  skolehub: { label: 'Brainbord', cls: 'bg-ink/[.07] text-ink' },
  canvas: { label: 'Canvas', cls: 'bg-[#e4002b]/10 text-[#b3001f] dark:text-[#ff6b80]' },
  teams: { label: 'Teams', cls: 'bg-[#5b5fc7]/12 text-[#4b4fb5] dark:text-[#a5a8ff]' },
  iskole: { label: 'iSkole', cls: 'bg-teal-500/12 text-teal-700 dark:text-teal-300' },
};

/** Viser hvor en opplysning kommer fra. `via` = opprinnelig plattform for data skolen har importert. */
export function SourceBadge({ source, via, className }: { source: string; via?: string | null; className?: string }) {
  const s = STYLE[source] ?? { label: source, cls: 'bg-ink/[.07]' };
  return (
    <span className={clsx('chip', s.cls, className)} title={via ? `Importert av skolen fra ${via}` : `Hentet fra ${s.label}`}>
      {s.label}{via ? <span className="font-normal opacity-70"> · {via}</span> : null}
    </span>
  );
}

export const SUBMISSION_META: Record<string, { label: string; cls: string }> = {
  levert: { label: 'Levert', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  vurdert: { label: 'Vurdert', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  pagar: { label: 'Pågår', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  ikke_levert: { label: 'Ikke levert', cls: 'bg-zinc-500/12 text-zinc-600 dark:text-zinc-300' },
  forfalt: { label: 'Forfalt', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' },
};

export function SubmissionBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted">–</span>;
  const m = SUBMISSION_META[status];
  return <span className={clsx('chip', m.cls)}>{m.label}</span>;
}

export function ExampleDataBanner() {
  return (
    <div role="note" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <b>Eksempeldata:</b> Skoledataene i Brainbord (merket «Brainbord») kommer fra en syntetisk testskole og gjelder ingen ekte elever.
      Data merket Canvas eller Teams er hentet fra din egen konto.
    </div>
  );
}
