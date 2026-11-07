const TZ = 'Europe/Oslo';

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateShort = (d: string | Date) =>
  new Date(d).toLocaleDateString('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short' });
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString('nb-NO', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtWeekday = (d: string | Date) =>
  new Date(d).toLocaleDateString('nb-NO', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

/** "om 3 dager", "i dag", "for 2 dager siden" */
export function relativeDays(d: string | Date, now = new Date()) {
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(new Date(d)) - day(now)) / 86_400_000);
  if (diff === 0) return 'i dag';
  if (diff === 1) return 'i morgen';
  if (diff === -1) return 'i går';
  return diff > 0 ? `om ${diff} dager` : `for ${-diff} dager siden`;
}

/** ISO-ukenummer */
export function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export const startOfWeek = (d: Date) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
export const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
export const WEEKDAYS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];
