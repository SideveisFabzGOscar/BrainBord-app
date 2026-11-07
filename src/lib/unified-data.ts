import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActivities } from './data';
import { linkEnv, type LinkPlatform } from './links';
import { openFor } from './open-link';
import { PLATFORM_LABEL } from './meta';
import type { SessionContext } from './session';
import { applyMyStatus, unifyTasks, type MyStatus, type TaskInput, type UStatus, type UnifiedTask } from './unified';

export interface ExternalRow {
  id: string; platform: 'canvas' | 'teams' | 'iskole'; kind: string; external_id: string; course_id: string | null; course_name: string | null; title: string;
  link_kind: 'direkte' | 'fag' | 'system' | null; course_url: string | null; submitted_at: string | null;
  body: string | null; author: string | null; due_at: string | null; ends_at: string | null; published_at: string | null; url: string | null;
  submission_status: UStatus; grade: string | null; score: number | null; points_possible: number | null; synced_at: string;
}
export interface ConnectionInfo {
  platform: 'canvas' | 'teams' | 'iskole'; status: 'ikke_tilkoblet' | 'tilkoblet' | 'feilet'; account_label: string | null;
  last_synced_at: string | null; last_error: string | null; error_code: string | null; scopes: string[];
}

export interface UnifiedData {
  tasks: UnifiedTask[];
  announcements: ExternalRow[];
  messages: ExternalRow[];
  events: ExternalRow[];
  courses: { name: string; sources: string[] }[];
  connections: ConnectionInfo[];
  /** Brainbord-dataene kommer fra en syntetisk testskole */
  schoolIsDemo: boolean;
}

/**
 * Henter alt brukeren har tilgang til. Begge spørringer går med brukerens
 * egen klient, så RLS sikrer at bare egne data (og skolens data brukeren
 * har rett til) kommer med.
 */
export async function loadUnified(supabase: SupabaseClient, s: SessionContext): Promise<UnifiedData> {
  const now = Date.now();
  const [acts, { data: ext }, { data: conns }, { data: school }, { data: marks }] = await Promise.all([
    loadActivities(supabase, s),
    supabase.from('external_items').select('*').eq('profile_id', s.userId).limit(5000),
    supabase.from('user_connections').select('platform, status, account_label, last_synced_at, last_error, error_code, scopes').eq('profile_id', s.userId),
    s.schoolId ? supabase.from('schools').select('is_demo').eq('id', s.schoolId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('task_marks').select('source, item_id, marked_at').eq('profile_id', s.userId),
  ]);
  const { data: myStat } = await supabase.from('task_status').select('source, item_id, status, updated_at').eq('profile_id', s.userId);
  const mine = new Map<string, { status: MyStatus; at: string }>((myStat ?? []).map((m: { source: string; item_id: string; status: MyStatus; updated_at: string }) =>
    [`${m.source}:${m.item_id}`, { status: m.status, at: m.updated_at }]));
  const marked = new Map<string, string>((marks ?? []).map((m: { source: string; item_id: string; marked_at: string }) => [`${m.source}:${m.item_id}`, m.marked_at]));
  const rows = (ext ?? []) as ExternalRow[];
  const studentView = !!s.studentId;

  const linkPlatform = (p: string): LinkPlatform =>
    (['canvas', 'teams', 'iskole', 'itslearning'] as string[]).includes(p) ? (p as LinkPlatform) : 'skolehub';
  const fromHub: TaskInput[] = acts
    .filter((a) => ['innlevering', 'oppgave', 'lekse', 'prosjekt', 'presentasjon', 'prove', 'eksamen', 'frist'].includes(a.activityType) || a.personal)
    .map((a) => ({
      source: 'skolehub', id: a.id, title: a.title, courseName: a.subjectName, dueAt: a.date, kind: a.kind === 'test' ? 'prove' : 'oppgave',
      activityType: a.activityType, body: a.description, grade: a.grade ?? null,
      submittedAt: a.submittedAt ?? null,
      url: a.sourceUrl, platform: linkPlatform(a.sourcePlatform), linkKind: a.sourceUrl ? 'direkte' : null,
      externalId: a.externalId, courseId: a.subjectId, internalUrl: `/arshjul?aktivitet=${a.id}`,
      via: a.sourcePlatform !== 'manual' ? PLATFORM_LABEL[a.sourcePlatform] : null,
      status: !studentView ? null : a.status === 'fullfort' ? 'vurdert' : a.status === 'levert' ? 'levert' : a.status === 'pagar' ? 'pagar'
        : Date.parse(a.date) < now ? 'forfalt' : 'ikke_levert',
    }));
  const fromExt: TaskInput[] = rows.filter((r) => r.kind === 'oppgave' || r.kind === 'prove').map((r) => ({
    source: r.platform === 'teams' ? 'teams' : 'canvas', id: r.id, title: r.title, courseName: r.course_name, dueAt: r.due_at,
    kind: r.kind === 'prove' ? 'prove' : 'oppgave', activityType: r.kind === 'prove' ? 'prove' : 'innlevering', body: r.body,
    grade: r.grade ?? (r.score != null ? `${r.score}${r.points_possible ? `/${r.points_possible}` : ''} p` : null),
    url: r.url, status: r.submission_status, submittedAt: r.submitted_at, platform: r.platform, linkKind: r.link_kind, externalId: r.external_id, courseId: r.course_id,
  }));

  const courseMap = new Map<string, Set<string>>();
  const addCourse = (name: string | null, src: string) => { if (!name) return; const k = name.trim(); courseMap.set(k, (courseMap.get(k) ?? new Set()).add(src)); };
  acts.forEach((a) => addCourse(a.subjectName, 'Brainbord'));
  rows.filter((r) => r.kind === 'fag').forEach((r) => addCourse(r.course_name ?? r.title, r.platform === 'teams' ? 'Teams' : 'Canvas'));

  const tasks = unifyTasks([...fromHub, ...fromExt], now).map((t) => {
    // Nyeste egne status på tvers av Canvas/Teams-kildene
    const own = t.sources.map((x) => mine.get(`${x.source}:${x.id}`)).filter(Boolean).sort((a, b) => b!.at.localeCompare(a!.at))[0];
    const solvedAt = t.sources.map((x) => marked.get(`${x.source}:${x.id}`)).find(Boolean) ?? null;
    const u = applyMyStatus({ ...t, open: openFor(t.sources, t.kind === 'prove', linkEnv()), solvedAt }, own?.status, now, own?.at);
    // Huket av som «Løst» i planen = levert i oversiktene (til eleven setter den tilbake)
    return solvedAt && u.status !== 'levert' && u.status !== 'vurdert'
      ? { ...u, status: 'levert' as const, deliveredAt: solvedAt, sourceStatus: u.sourceStatus ?? u.status } : u;
  });
  return {
    tasks,
    announcements: rows.filter((r) => r.kind === 'kunngjoring').sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '')),
    messages: rows.filter((r) => r.kind === 'melding').sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '')),
    events: rows.filter((r) => r.kind === 'hendelse' && r.due_at && Date.parse(r.due_at) >= now - 86_400_000)
      .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? '')),
    courses: [...courseMap].map(([name, src]) => ({ name, sources: [...src] })).sort((a, b) => a.name.localeCompare(b.name, 'nb')),
    connections: ((conns ?? []) as ConnectionInfo[]),
    schoolIsDemo: !!(school as { is_demo?: boolean } | null)?.is_demo,
  };
}

