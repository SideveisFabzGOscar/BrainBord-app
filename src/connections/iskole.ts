import { ConnError, type ProviderModule } from './types';

/**
 * iSkole (Barman Hanssen AS).
 * Undersøkt 7. nov. 2026: den offentlige dokumentasjonen (dokumentasjon.iskole.net)
 * beskriver elevportal, fravær, vurdering og timeplan, men nevner INGEN API,
 * eksport eller tredjepartstilgang for elever. Vi antar derfor ikke at et API finnes.
 *
 * Denne modulen kobler ikke til noe. Den returnerer alltid NO_OFFICIAL_ACCESS,
 * slik at grensesnittet kan forklare hva som må til. Fravær fra iSkole kan likevel
 * vises i Brainbord når SKOLEN importerer det (CSV-import på skolenivå, eller en
 * leverandørintegrasjon via skoleeier – se src/integrations/connectors/partner-rest.ts).
 */
export const iskoleModule: ProviderModule = {
  platform: 'iskole',
  label: 'iSkole',
  provides: ['Fravær (når skolen importerer det til Brainbord)'],
  limitations: [
    'Ingen dokumentert API eller godkjent elev-innlogging for tredjepartsapper.',
    'Personlig tilkobling krever avtale mellom skoleeier (fylkeskommune/kommune) og Barman Hanssen AS.',
    'Brainbord ber aldri om iSkole-/Feide-passordet ditt, og henter ikke data ved å logge inn for deg.',
  ],
  docsUrl: 'https://dokumentasjon.iskole.net/en/docs/oversikt/',
  configured: () => ({ ok: false, missing: ['Avtale med leverandør (Barman Hanssen AS) via skoleeier', 'Dokumentert API eller integrasjon'], reason: 'NO_OFFICIAL_ACCESS' }),
  scopes: () => [],
  authorizeUrl: () => { throw new ConnError('NO_OFFICIAL_ACCESS', 'iSkole har ingen offentlig tilgang'); },
  exchangeCode: async () => { throw new ConnError('NO_OFFICIAL_ACCESS', 'iSkole har ingen offentlig tilgang'); },
  refresh: async () => { throw new ConnError('NO_OFFICIAL_ACCESS', 'iSkole har ingen offentlig tilgang'); },
  revoke: async () => {},
  fetchData: async () => { throw new ConnError('NO_OFFICIAL_ACCESS', 'iSkole har ingen offentlig tilgang'); },
};
