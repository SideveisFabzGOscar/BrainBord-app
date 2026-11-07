import type { Mood } from '@/lib/catchup';

/** P1 rød sur munn, P2 lyserød strek, P3 lysegrønn smil, P4 mørkegrønn smil */
export const MOOD: Record<Mood, { fill: string; ink: string; mouth: string; label: string }> = {
  1: { fill: '#991b1b', ink: '#ffffff', mouth: 'M6.5 18c1.6-2.4 3.4-3.4 5.5-3.4s3.9 1 5.5 3.4', label: 'Du har utløpte oppgaver (P1)' },
  2: { fill: '#fca5a5', ink: '#7f1d1d', mouth: 'M6.8 16h10.4', label: 'Du har oppgaver som forfaller innen 7 dager (P2)' },
  3: { fill: '#86efac', ink: '#14532d', mouth: 'M6.5 14c1.6 2.4 3.4 3.4 5.5 3.4s3.9-1 5.5-3.4', label: 'Du er à jour – bare P3-oppgaver igjen' },
  4: { fill: '#15803d', ink: '#ffffff', mouth: 'M6 13.5c1.6 3 3.6 4.4 6 4.4s4.4-1.4 6-4.4', label: 'Du er i forkant – bare P4 eller ingenting' },
};

export function MoodFace({ mood, size = 24 }: { mood: Mood; size?: number }) {
  const m = MOOD[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={m.label}>
      <circle cx="12" cy="12" r="11" fill={m.fill} />
      <circle cx="8.6" cy="9.5" r="1.4" fill={m.ink} />
      <circle cx="15.4" cy="9.5" r="1.4" fill={m.ink} />
      <path d={m.mouth} fill="none" stroke={m.ink} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
