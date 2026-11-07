import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight, CalendarClock, Info, Megaphone, MessageSquare } from 'lucide-react';
import { ExampleDataBanner, SourceBadge, SubmissionBadge } from '@/components/source-badge';
import { OpenButton } from '@/components/open-button';
import { SmartBoard } from '@/components/smart-board';
import { linkEnv } from '@/lib/links';
import { openForItem } from '@/lib/open-link';
import { EmptyState, PageHeader, StatCard } from '@/components/ui';
import { loadAbsences, summarizeAbsence } from '@/lib/data';
import { fmtDate, fmtDateTime, relativeDays } from '@/lib/format';
import { PLATFORM_LABEL } from '@/lib/meta';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadUnified } from '@/lib/unified-data';
import { urgency } from '@/lib/unified';

export const metadata = { title: 'Samlet oversikt' };

const CONN_LABEL = { canvas: 'Canvas', teams: 'Teams', iskole: 'iSkole' } as const;

function Section({ title, icon, children, action, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('card min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-medium">{icon}{title}</h2>{action}
      </div>
      {children}
    </section>
  );
}

export default async function SamletPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [data, absences] = await Promise.all([loadUnified(supabase, s), loadAbsences(supabase, s)]);
  const now = Date.now();
  const abs = summarizeAbsence(absences);
  const upcoming = data.tasks.filter((t) => t.dueAt && Date.parse(t.dueAt) >= now - 3_600_000);
  const week = upcoming.filter((t) => Date.parse(t.dueAt!) < now + 7 * 86_400_000);
  const overdue = data.tasks.filter((t) => t.status === 'forfalt');
  const done = data.tasks.filter((t) => t.status === 'levert' || t.status === 'vurdert').length;
  const graded = data.tasks.filter((t) => t.grade).sort((a, b) => (b.dueAt ?? '').localeCompare(a.dueAt ?? '')).slice(0, 8);
  const tests = upcoming.filter((t) => t.kind === 'prove').slice(0, 6);
  const absSources = [...new Set(absences.map((a) => a.source_platform ?? 'manual'))];
  const dupes = data.tasks.filter((t) => t.sources.length > 1).length;

  return (
    <>
      <PageHeader title="Samlet oversikt"
        description="Alt fra Brainbord, Canvas og Teams på ett sted. Trykk «Åpne oppgave» eller «Åpne prøve» for å gå rett til riktig side i kildesystemet."
        actions={<Link href="/integrasjoner" className="btn-outline">Administrer tilkoblinger</Link>} />
      {data.schoolIsDemo && <ExampleDataBanner />}

      <div className="mb-5 flex flex-wrap gap-2" aria-label="Status for tilkoblinger">
        {(['iskole', 'canvas', 'teams'] as const).map((p) => {
          const c = data.connections.find((x) => x.platform === p);
          const st = c?.status ?? 'ikke_tilkoblet';
          return (
            <Link key={p} href="/integrasjoner" className={clsx('chip border py-1',
              st === 'tilkoblet' ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : st === 'feilet' ? 'border-red-500/30 text-red-700 dark:text-red-300' : 'border-line text-muted')}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', st === 'tilkoblet' ? 'bg-emerald-500' : st === 'feilet' ? 'bg-red-500' : 'bg-zinc-400')} />
              {CONN_LABEL[p]}: {st === 'tilkoblet' ? (c?.last_synced_at ? `synk. ${fmtDateTime(c.last_synced_at)}` : 'tilkoblet') : st === 'feilet' ? 'tilkobling feilet' : 'ikke tilkoblet'}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Frister neste 7 dager" value={week.length} icon={<CalendarClock size={15} />} />
        <StatCard label="Forfalt, ikke levert" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
        <StatCard label="Levert eller vurdert" value={done} tone="good" hint={dupes ? `${dupes} oppgaver fantes i flere systemer og er slått sammen` : undefined} />
        <StatCard label="Udokumentert fravær" value={`${abs.undocumented} t`} tone={abs.undocumented ? 'warn' : 'good'} hint={`${abs.total} t totalt`} />
      </div>

      <div className="mt-6"><SmartBoard tasks={data.tasks} now={now} /></div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section title="Kommende frister" className="xl:col-span-2" action={<Link href="/mine-oppgaver" className="text-sm text-accent hover:underline">Alle oppgaver <ArrowRight size={13} className="inline" /></Link>}>
          {upcoming.length === 0 ? <EmptyState title="Ingen kommende frister" text="Koble til Canvas eller Teams for å hente oppgavene dine." /> : (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 12).map((t) => {
                const u = urgency(t, now);
                return (
                  <li key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <div className={clsx('w-24 shrink-0 text-xs', u === 'idag' || u === 'snart' ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted')}>{relativeDays(t.dueAt!)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="text-xs text-muted">{t.courseName ?? 'Uten fag'} · {fmtDateTime(t.dueAt!)}</div>
                    </div>
                    <SubmissionBadge status={t.status} />
                    <div className="flex gap-1">{t.sources.map((x) => <SourceBadge key={x.source + x.id} source={x.source} />)}</div>
                    <OpenButton link={t.open} size="sm" showNote={false} />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Fravær">
          <div className="space-y-3 p-5 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-ink/[.04] p-2"><div className="text-lg font-semibold tabular-nums">{abs.total}</div><div className="text-[11px] text-muted">timer totalt</div></div>
              <div className="rounded-lg bg-ink/[.04] p-2"><div className="text-lg font-semibold tabular-nums text-emerald-600">{abs.documented}</div><div className="text-[11px] text-muted">dokumentert</div></div>
              <div className="rounded-lg bg-ink/[.04] p-2"><div className="text-lg font-semibold tabular-nums text-amber-600">{abs.undocumented}</div><div className="text-[11px] text-muted">udokumentert</div></div>
            </div>
            {abs.bySubject.slice(0, 4).map((x) => <div key={x.name} className="flex justify-between"><span className="truncate">{x.name}</span><span className="tabular-nums text-muted">{x.hours} t</span></div>)}
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted">Kilde: <SourceBadge source="skolehub" />
              {absSources.filter((x) => x !== 'manual').map((x) => <span key={x}>importert av skolen fra {PLATFORM_LABEL[x] ?? x}</span>)}</div>
            <p className="flex gap-1.5 text-xs text-muted"><Info size={13} className="mt-px shrink-0" />iSkole har ikke et åpent API. Fravær vises når skolen importerer det til Brainbord.</p>
            <Link href="/fravaer" className="text-sm text-accent hover:underline">Fraværsdetaljer →</Link>
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="Fag">
          {data.courses.length === 0 ? <EmptyState title="Ingen fag" /> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {data.courses.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="flex shrink-0 gap-1">{c.sources.map((x) => <SourceBadge key={x} source={x.toLowerCase()} />)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Timeplan og hendelser">
          <div className="p-5 text-sm">
            {data.events.length === 0 ? <p className="text-muted">Ingen kalenderhendelser fra Canvas.</p> : (
              <ul className="space-y-2.5">
                {data.events.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="truncate font-medium">{e.title}</div>
                      <div className="text-xs text-muted">{fmtDateTime(e.due_at!)}{e.course_name ? ` · ${e.course_name}` : ''}</div></div>
                    <span className="flex shrink-0 flex-col items-end gap-1"><SourceBadge source={e.platform} /><OpenButton link={openForItem(e, linkEnv())} size="sm" showNote={false} /></span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex gap-1.5 rounded-lg bg-ink/[.04] p-3 text-xs text-muted">
              <Info size={13} className="mt-px shrink-0" />
              Selve timeplanen ligger i iSkole, som ikke har et åpent API. Den kan vises her når skolen får en avtale med leverandøren.
            </p>
          </div>
        </Section>

        <Section title="Prøver og vurderinger">
          <div className="p-5 text-sm">
            <div className="label">Kommende prøver</div>
            {tests.length === 0 ? <p className="text-muted">Ingen kommende prøver.</p> : (
              <ul className="mb-4 space-y-2">{tests.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted">{fmtDate(t.dueAt!)}</span></li>))}</ul>
            )}
            <div className="label mt-3">Siste vurderinger</div>
            {graded.length === 0 ? <p className="text-muted">Ingen publiserte karakterer eller poeng.</p> : (
              <ul className="space-y-2">{graded.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5"><b className="tabular-nums">{t.grade}</b><SourceBadge source={t.sources[0].source} /></span></li>))}</ul>
            )}
            {!data.connections.some((c) => c.platform === 'teams' && c.scopes?.includes('EduAssignments.Read')) && (
              <p className="mt-3 text-xs text-muted">Karakterer fra Teams vises bare hvis skolen har godkjent lesetilgang til vurderinger.</p>
            )}
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Kunngjøringer" icon={<Megaphone size={15} />}>
          {data.announcements.length === 0 ? (
            <EmptyState title="Ingen kunngjøringer" text="Kunngjøringer hentes fra Canvas. Teams-kanaler hentes ikke, fordi det krever tilgang til å lese alle meldinger." />
          ) : (
            <ul className="divide-y divide-line">
              {data.announcements.slice(0, 6).map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted">{a.course_name}{a.author ? ` · ${a.author}` : ''}{a.published_at ? ` · ${fmtDateTime(a.published_at)}` : ''}</div></div>
                    <SourceBadge source={a.platform} />
                  </div>
                  {a.body && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{a.body}</p>}
                  <div className="mt-2"><OpenButton link={openForItem(a, linkEnv())} size="sm" /></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Meldinger" icon={<MessageSquare size={15} />}>
          {data.messages.length === 0 ? <EmptyState title="Ingen meldinger" text="Meldinger hentes fra Canvas-innboksen når Canvas er koblet til." /> : (
            <ul className="divide-y divide-line">
              {data.messages.slice(0, 6).map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="truncate font-medium">{m.title}</div>
                      <div className="text-xs text-muted">{m.author}{m.published_at ? ` · ${fmtDateTime(m.published_at)}` : ''}</div></div>
                    <SourceBadge source={m.platform} />
                  </div>
                  {m.body && <p className="mt-1 line-clamp-2 text-sm text-muted">{m.body}</p>}
                  <div className="mt-2"><OpenButton link={openForItem(m, linkEnv())} size="sm" /></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
