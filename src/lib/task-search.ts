/**
 * Forstår norske spørsmål om oppgaver og prøver, og finner riktige oppføringer
 * i brukerens egne data. Ingen språkmodell: svaret kan bare inneholde oppgaver
 * som faktisk finnes, og «Åpne»-knappene peker på lagrede originallenker.
 *
 * Eksempler: «Når har jeg neste prøve?», «Vis meg matteinnleveringen»,
 * «Hvor finner jeg engelskleksa?», «Åpne prøven jeg har på fredag»,
 * «Hvilke oppgaver må jeg levere denne uken?»
 */
import { osloDay, type UnifiedTask } from './unified';

const SUBJECTS: { name: string; words: RegExp; match: RegExp }[] = [
  { name: 'matematikk', words: /\b(matte\w*|matematikk\w*|mat)\b/, match: /matte|matemat|\bmat\d|\bmat\b|\b(r1|r2|s1|s2|1t|1p|2p)\b/ },
  { name: 'norsk', words: /\bnorsk\w*/, match: /norsk|\bnor\d/ },
  { name: 'engelsk', words: /\bengelsk\w*|\benglish\b/, match: /engelsk|english|\beng\d/ },
  { name: 'fysikk', words: /\bfysikk\w*/, match: /fysikk|\bfys\d/ },
  { name: 'kjemi', words: /\bkjemi\w*/, match: /kjemi|\bkje\d/ },
  { name: 'biologi', words: /\bbiologi\w*|\bbio\b/, match: /biologi|\bbio\d/ },
  { name: 'naturfag', words: /\bnaturfag\w*/, match: /naturfag|\bnat\d/ },
  { name: 'historie', words: /\bhistorie\w*/, match: /histor|\bhis\d/ },
  { name: 'samfunnsfag', words: /\bsamfunns\w*|\bsamf\b/, match: /samfunn|\bsaf\d/ },
  { name: 'geografi', words: /\bgeografi\w*|\bgeo\b/, match: /geografi|\bgeo\d/ },
  { name: 'religion', words: /\breligion\w*|\brle\b|\bkrle\b/, match: /religion|\b(k?rle)\b|\brel\d/ },
  { name: 'spansk', words: /\bspansk\w*/, match: /spansk|\bspa\d/ },
  { name: 'tysk', words: /\btysk\w*/, match: /tysk|\btys\d/ },
  { name: 'fransk', words: /\bfransk\w*/, match: /fransk|\bfra\d/ },
  { name: 'kroppsøving', words: /\bkroppsøving\w*|\bgym\b/, match: /kroppsøving|\bgym\b|\bkro\d/ },
  { name: 'økonomi', words: /\bøkonomi\w*/, match: /økonomi/ },
];
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

export interface SearchResult {
  matches: UnifiedTask[];
  /** Spørsmålet ber om én bestemt ting («neste prøve», «åpne matteinnleveringen») */
  single: boolean;
  /** Hvordan spørsmålet ble tolket, vist til brukeren */
  understood: string[];
  /** Tolket vi noe som helst? Hvis ikke, bør spørsmålet gå til den generelle assistenten. */
  recognized: boolean;
  /** Ingen treff blant kommende, men vi fant tidligere oppføringer */
  fromPast: boolean;
}

function dayAhead(now: number, i: number) { return osloDay(new Date(now + i * 86_400_000).toISOString()); }
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function findTasks(question: string, tasks: UnifiedTask[], now: number): SearchResult {
  const q = ` ${question.toLowerCase().normalize('NFKC').replace(/[?!.,«»"]/g, ' ')} `;
  const understood: string[] = [];

  // Type
  let kind: 'prove' | 'oppgave' | null = null;
  let lekse = false;
  if (/prøv|\btest|eksamen|tentamen|quiz/.test(q)) { kind = 'prove'; understood.push('prøver'); }
  else if (/lekse|leksa|leksene/.test(q)) { kind = 'oppgave'; lekse = true; understood.push('lekser'); }
  else if (/innlevering|oppgave|levere|leveres|prosjekt|presentasjon/.test(q)) { kind = 'oppgave'; understood.push('oppgaver/innleveringer'); }

  // Fag (også sammensatt: «matteinnleveringen», «engelskleksa»)
  const subj = SUBJECTS.find((s) => s.words.test(q) || new RegExp(`\\b${s.name.slice(0, 5)}`).test(q));
  if (subj) understood.push(`fag: ${subj.name}`);

  // Tid
  let days: Set<string> | null = null;
  const today = dayAhead(now, 0);
  if (/\bi dag\b/.test(q)) { days = new Set([today]); understood.push('i dag'); }
  else if (/\bi morgen\b/.test(q)) { days = new Set([dayAhead(now, 1)]); understood.push('i morgen'); }
  else if (/denne uk(a|en)|\buka\b|\bdenne veka\b/.test(q)) {
    const dow = (weekdayOf(today) + 6) % 7; // man=0
    days = new Set(Array.from({ length: 7 - dow }, (_, i) => dayAhead(now, i)));
    understood.push('denne uken');
  } else if (/neste uk(e|a)/.test(q)) {
    const dow = (weekdayOf(today) + 6) % 7;
    days = new Set(Array.from({ length: 7 }, (_, i) => dayAhead(now, 7 - dow + i)));
    understood.push('neste uke');
  } else if (/\bi helg(a|en)\b|\bhelgen\b/.test(q)) {
    days = new Set(Array.from({ length: 8 }, (_, i) => dayAhead(now, i)).filter((d) => [0, 6].includes(weekdayOf(d))).slice(0, 2));
    understood.push('i helgen');
  } else {
    const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b(på |)${w}`).test(q));
    if (wd >= 0) {
      const d = Array.from({ length: 7 }, (_, i) => dayAhead(now, i)).find((x) => weekdayOf(x) === wd)!;
      days = new Set([d]); understood.push(`${WEEKDAYS[wd]} ${d.slice(8)}.${d.slice(5, 7)}`);
    }
  }

  const mustDeliver = /\bmå\b.*levere|\blevere\b|ikke levert|gjenstår/.test(q);
  const next = /\bneste\b|\bførste\b|nærmeste/.test(q);
  const navigate = /\b(vis|åpne|finn|finner|hvor er|hvor finner|ta meg til|gå til)\b/.test(q);
  const single = next || (navigate && !/\b(alle|hvilke)\b/.test(q));
  const recognized = !!(kind || subj || days || next || navigate);

  let pool = tasks.filter((t) => !!t.dueAt);
  if (kind) pool = pool.filter((t) => t.kind === kind);
  if (subj) pool = pool.filter((t) => subj.match.test(`${t.courseName ?? ''} ${t.title}`.toLowerCase()));
  if (lekse) {
    const l = pool.filter((t) => t.activityType === 'lekse' || /lekse/i.test(t.title));
    if (l.length) pool = l; // ellers: vis fagets oppgaver i stedet
  }
  if (days) pool = pool.filter((t) => days!.has(osloDay(t.dueAt!)));
  if (mustDeliver) pool = pool.filter((t) => t.status !== 'levert' && t.status !== 'vurdert');

  const upcoming = pool.filter((t) => Date.parse(t.dueAt!) >= now - 3_600_000).sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  let matches = upcoming, fromPast = false;
  if (!matches.length && !days && !next) {
    matches = pool.filter((t) => Date.parse(t.dueAt!) >= now - 30 * 86_400_000).sort((a, b) => Date.parse(b.dueAt!) - Date.parse(a.dueAt!));
    fromPast = matches.length > 0;
  }
  if (single) matches = matches.slice(0, 1);
  return { matches: matches.slice(0, 10), single, understood, recognized, fromPast };
}

const fmt = (iso: string) => new Date(iso).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Kort svartekst til søket. Nevner bare oppføringene som ble funnet. */
export function describeSearch(r: SearchResult, question: string): string {
  const what = r.understood.length ? ` (tolket som: ${r.understood.join(', ')})` : '';
  if (!r.matches.length) {
    return `Jeg fant ingen oppføring som passer «${question}»${what}. Det kan bety at den ikke er lagt ut ennå, eller at systemet den ligger i ikke er koblet til.`;
  }
  const first = r.matches[0];
  if (r.single) {
    const lead = first.kind === 'prove' ? 'Neste prøve' : 'Oppgaven';
    return `${r.fromPast ? 'Ingen kommende treff, men jeg fant denne fra den siste måneden: ' : `${lead}: `}${first.title}${first.courseName ? ` i ${first.courseName}` : ''}, ${fmt(first.dueAt!)}.${what}`;
  }
  return `Fant ${r.matches.length} ${r.matches.length === 1 ? 'oppføring' : 'oppføringer'}${what}:\n` +
    r.matches.map((t) => `- ${t.title}${t.courseName ? ` (${t.courseName})` : ''}: ${fmt(t.dueAt!)}`).join('\n');
}
