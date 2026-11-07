import { NextResponse } from 'next/server';
import {
  buildContext, callClaude, deterministicAnswer, MODE_PROMPT, validateAnswer, type AnnouncementInput, type AssistantMode,
} from '@/lib/assistant';
import { prioritize, weekPlan } from '@/lib/planner';
import { describeSearch, findTasks } from '@/lib/task-search';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadUnified } from '@/lib/unified-data';
import { linkEnv } from '@/lib/links';
import { openForItem } from '@/lib/open-link';

export const runtime = 'nodejs';
const MODES: AssistantMode[] = ['oppsummer', 'prioriter', 'ukeplan', 'kunngjoringer', 'sporsmal'];
const recent = new Map<string, number[]>();

export async function POST(req: Request) {
  const s = await getSession();
  const body = await req.json().catch(() => ({}));
  const mode = MODES.includes(body.mode) ? (body.mode as AssistantMode) : null;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (!mode || (mode === 'sporsmal' && !question)) return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 });

  // Maks 20 forespørsler per 10 min per bruker
  const now = Date.now();
  const hist = (recent.get(s.userId) ?? []).filter((t) => now - t < 600_000);
  if (hist.length >= 20) return NextResponse.json({ error: 'Du har brukt assistenten mye nå. Vent noen minutter.' }, { status: 429 });
  recent.set(s.userId, [...hist, now]);

  const data = await loadUnified(await createClient(), s);
  const ann: AnnouncementInput[] = data.announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, courseName: a.course_name,
    publishedAt: a.published_at, author: a.author, source: a.platform }));
  const base = deterministicAnswer(mode === 'sporsmal' ? 'oppsummer' : mode, data.tasks, ann, now);
  const { ctx, refToKey } = buildContext(data.tasks, ann, now);
  // Referanseliste: lar brukeren se nøyaktig hvilken oppgave/kunngjøring svaret bygger på, og åpne kilden
  const refs = [...refToKey].map(([ref, k]) => {
    const t = data.tasks.find((x) => x.key === k);
    if (t) return { ref, title: t.title, sources: t.sources.map((x) => ({ source: x.source })), open: t.open ?? null };
    const a = data.announcements.find((x) => x.id === k);
    return { ref, title: a?.title ?? '', sources: a ? [{ source: a.platform }] : [], open: a ? openForItem(a, linkEnv()) : null };
  });
  const meta = { tasks: data.tasks.length, announcements: ann.length, exampleData: data.schoolIsDemo, refs,
    connected: data.connections.filter((c) => c.status === 'tilkoblet').map((c) => c.platform) };

  // Spørsmål om en bestemt oppgave/prøve («åpne prøven på fredag») besvares med søk i databasen.
  // Knappene peker på lagrede originallenker; ingen språkmodell lager lenker eller oppføringer.
  if (mode === 'sporsmal') {
    const sr = findTasks(question, data.tasks, now);
    if (sr.recognized) {
      const actions = sr.matches.map((t) => ({ title: t.title, courseName: t.courseName, dueAt: t.dueAt, kind: t.kind, status: t.status,
        sources: t.sources.map((x) => x.source), open: t.open ?? null }));
      return NextResponse.json({ answer: describeSearch(sr, question), engine: 'sok', actions, meta,
        note: 'Funnet direkte i dine egne data. Knappene åpner originalen i systemet den ligger i.' });
    }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ answer: base, engine: 'regelbasert', note: 'AI-tjenesten er ikke satt opp. Svaret er beregnet direkte fra dataene dine.', meta });

  const grounding = mode === 'ukeplan' ? JSON.stringify(weekPlan(data.tasks, now).days.map((d) => ({ dag: d.day, okter: d.blocks.map((b) => `${b.start}-${b.end} ${b.title}`) })))
    : mode === 'prioriter' ? JSON.stringify(prioritize(data.tasks, now).slice(0, 8).map((p) => ({ tittel: p.task.title, grunn: p.reason }))) : base;
  const prompt = `<data>\n${JSON.stringify(ctx)}\n</data>\n<grunnlag>\n${grounding}\n</grunnlag>\n\n${mode === 'sporsmal' ? question : MODE_PROMPT[mode]}`;
  try {
    const answer = await callClaude(fetch, key, process.env.ASSISTANT_MODEL ?? 'claude-sonnet-5-5', prompt);
    const v = validateAnswer(answer, ctx);
    if (!v.ok || !answer) {
      return NextResponse.json({ answer: base, engine: 'regelbasert', note: 'AI-svaret inneholdt opplysninger som ikke kunne bekreftes i dataene dine, så det ble forkastet. Dette svaret er beregnet direkte fra dataene.', meta });
    }
    return NextResponse.json({ answer, engine: 'ai', note: 'Formulert av AI ut fra dine egne data. Referansene i [ ] viser hvor opplysningen kommer fra.', meta });
  } catch {
    return NextResponse.json({ answer: base, engine: 'regelbasert', note: 'AI-tjenesten svarte ikke. Svaret er beregnet direkte fra dataene dine.', meta });
  }
}
