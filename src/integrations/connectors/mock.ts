import type { Connector, NormalizeResult, ActivityType } from '../types';

/**
 * Testintegrasjon med SYNTETISKE data. Merket tydelig som "testmodus" i UI.
 * Brukes til å teste hele synkroniseringsløpet (henting → normalisering →
 * duplikatkontroll → lagring → årshjul) uten ekte API-tilgang.
 * config.revision kan økes for å simulere at plattformen endrer en oppgave.
 */
export interface MockRaw { revision: number; baseDate: string }

const ITEMS: { id: string; title: string; type: ActivityType; subject: string; offsetDays: number }[] = [
  { id: 'm1', title: 'Fagartikkel om klimaendringer', type: 'innlevering', subject: 'NOR1260', offsetDays: 4 },
  { id: 'm2', title: 'Kapittelprøve: derivasjon', type: 'prove', subject: 'MAT1001', offsetDays: 9 },
  { id: 'm3', title: 'Labrapport: bevegelse', type: 'innlevering', subject: 'FYS1001', offsetDays: 12 },
  { id: 'm4', title: 'Gruppeprosjekt: Den kalde krigen', type: 'prosjekt', subject: 'HIS1010', offsetDays: 20 },
  { id: 'm5', title: 'Muntlig presentasjon: ungdomsspråk', type: 'presentasjon', subject: 'NOR1260', offsetDays: 15 },
  { id: 'm6', title: 'Oppgavesett: redoksreaksjoner', type: 'oppgave', subject: 'KJE1001', offsetDays: 6 },
];

export const mockConnector: Connector<MockRaw> = {
  platform: 'mock',
  displayName: 'Testintegrasjon (syntetiske data)',
  authType: 'none',
  status: () => ({ configured: true, missing: [], accessNote: 'Kun syntetiske testdata. Henter ikke fra noen ekte plattform.' }),

  async fetchRaw(ctx) {
    ctx.logger.info('Testintegrasjon: genererer syntetiske data (ingen ekstern forespørsel)');
    return { revision: Number(ctx.config.revision ?? 1), baseDate: String(ctx.config.baseDate ?? new Date().toISOString()) };
  },

  normalize(raw): NormalizeResult {
    const base = new Date(raw.baseDate);
    base.setUTCHours(13, 0, 0, 0);
    return {
      activities: ITEMS.map((it) => ({
        externalId: `mock:${it.id}`,
        kind: it.type === 'prove' ? 'test' as const : 'assignment' as const,
        activityType: it.type,
        // revisjon > 1 endrer én tittel => tester oppdatering av eksisterende rad
        title: it.id === 'm1' && raw.revision > 1 ? `${it.title} (revidert v${raw.revision})` : it.title,
        description: 'Syntetisk aktivitet fra testintegrasjonen.',
        subjectCode: it.subject,
        dueAt: new Date(base.getTime() + it.offsetDays * 86_400_000).toISOString(),
      })),
      absences: [],
      errors: [],
    };
  },
};
