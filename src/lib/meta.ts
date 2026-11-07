/** Felles etiketter og fargekoder for hele appen */

export type Role = 'student' | 'teacher' | 'admin' | 'parent';
export type WorkStatus = 'ikke_startet' | 'pagar' | 'levert' | 'fullfort';
export type ActivityType =
  | 'innlevering' | 'oppgave' | 'lekse' | 'prosjekt' | 'presentasjon' | 'frist' | 'annet' | 'prove' | 'eksamen';

/** Fargegruppe i årshjulet (spesifikasjonen: blå/rød/grønn/lilla/oransje/grå) */
export type ColorGroup = 'innlevering' | 'prove' | 'oppgave' | 'prosjekt' | 'eksamen' | 'annet';

export const COLOR_GROUP_OF: Record<ActivityType, ColorGroup> = {
  innlevering: 'innlevering',
  prove: 'prove',
  oppgave: 'oppgave',
  lekse: 'oppgave',
  prosjekt: 'prosjekt',
  presentasjon: 'prosjekt',
  eksamen: 'eksamen',
  frist: 'annet',
  annet: 'annet',
};

export const GROUP_META: Record<ColorGroup, { label: string; hex: string; soft: string; text: string }> = {
  innlevering: { label: 'Innleveringer', hex: '#3b82f6', soft: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
  prove:       { label: 'Prøver',        hex: '#ef4444', soft: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
  oppgave:     { label: 'Oppgaver',      hex: '#22c55e', soft: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400' },
  prosjekt:    { label: 'Prosjekter',    hex: '#a855f7', soft: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400' },
  eksamen:     { label: 'Eksamen',       hex: '#f97316', soft: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400' },
  annet:       { label: 'Andre aktiviteter', hex: '#6b7280', soft: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400' },
};

export const TYPE_LABEL: Record<ActivityType, string> = {
  innlevering: 'Innlevering', oppgave: 'Oppgave', lekse: 'Lekse', prosjekt: 'Prosjekt', presentasjon: 'Presentasjon',
  frist: 'Frist', annet: 'Annet', prove: 'Prøve', eksamen: 'Eksamen',
};

export const STATUS_META: Record<WorkStatus, { label: string; cls: string }> = {
  ikke_startet: { label: 'Ikke startet', cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
  pagar:        { label: 'Pågår',        cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  levert:       { label: 'Levert',       cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  fullfort:     { label: 'Fullført',     cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
};

export const PLATFORM_LABEL: Record<string, string> = {
  manual: 'Manuelt', teams: 'Microsoft Teams', itslearning: 'itslearning', iskole: 'iSkole',
  canvas: 'Canvas', csv: 'CSV-import', mock: 'Testintegrasjon',
};

export const ROLE_LABEL: Record<Role, string> = { student: 'Elev', teacher: 'Lærer', admin: 'Skoleadministrator', parent: 'Foresatt' };

export const ABSENCE_LABEL: Record<string, string> = {
  sykdom: 'Sykdom', legetime: 'Lege/tannlege', permisjon: 'Permisjon', skoleaktivitet: 'Skoleaktivitet',
  annet: 'Annet', udokumentert: 'Udokumentert',
};
export const DOC_STATUS_META: Record<string, { label: string; cls: string }> = {
  ikke_dokumentert: { label: 'Ikke dokumentert', cls: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  venter:           { label: 'Venter behandling', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  godkjent:         { label: 'Godkjent', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  avvist:           { label: 'Avvist', cls: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300' },
};
export const DOC_TYPE_LABEL: Record<string, string> = {
  legeerklaering: 'Legeerklæring', egenmelding: 'Egenmelding', permisjonssoknad: 'Permisjonssøknad',
  annen_dokumentasjon: 'Annen dokumentasjon',
};
