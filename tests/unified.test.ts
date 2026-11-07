import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unifyTasks, urgency, type TaskInput } from '../src/lib/unified';
import { prioritize, weekPlan } from '../src/lib/planner';
import { buildContext, deterministicAnswer, validateAnswer } from '../src/lib/assistant';

const NOW = Date.parse('2026-11-07T11:00:00Z'); // lørdag
const t = (o: Partial<TaskInput> & Pick<TaskInput, 'source' | 'id' | 'title'>): TaskInput =>
  ({ courseName: null, dueAt: null, kind: 'oppgave', status: null, url: null, ...o });

test('Samme oppgave i Canvas og Teams vises én gang; status «levert» vinner', () => {
  const out = unifyTasks([
    t({ source: 'canvas', id: '1', title: 'Novelleanalyse', dueAt: '2026-11-20T22:59:00Z', status: 'ikke_levert', url: 'https://c/1' }),
    t({ source: 'teams', id: 'a1', title: 'Novelleanalyse!', dueAt: '2026-11-20T21:00:00Z', status: 'levert', url: 'https://t/1' }),
    t({ source: 'canvas', id: '2', title: 'Novelleanalyse', dueAt: '2026-11-27T22:59:00Z' }),           // annen dag: egen oppgave
    t({ source: 'canvas', id: '3', title: 'Novelleanalyse', dueAt: '2026-11-20T22:59:00Z' }),           // samme kilde: slås ikke sammen
  ], NOW);
  assert.equal(out.length, 3);
  const merged = out.find((x) => x.sources.length === 2)!;
  assert.equal(merged.status, 'levert');
  assert.deepEqual(merged.sources.map((s) => s.source).sort(), ['canvas', 'teams']);
  assert.ok(Date.parse(out[0].dueAt!) <= Date.parse(out[2].dueAt!), 'sortert etter frist');
});

test('Forfalt når ingen kilde har levering og fristen er passert', () => {
  const [x] = unifyTasks([t({ source: 'canvas', id: '1', title: 'A', dueAt: '2026-11-01T10:00:00Z', status: 'ikke_levert' })], NOW);
  assert.equal(x.status, 'forfalt');
  assert.equal(urgency(x, NOW), 'forfalt');
  assert.equal(urgency({ dueAt: '2026-11-08T10:00:00Z', status: 'ikke_levert' }, NOW), 'snart');
});

const tasks = unifyTasks([
  t({ source: 'canvas', id: '1', title: 'Novelleanalyse', courseName: 'Norsk', dueAt: '2026-11-12T22:59:00Z', status: 'ikke_levert', activityType: 'innlevering' }),
  t({ source: 'teams', id: '2', title: 'Kapittelprøve vektorer', courseName: 'Matte', dueAt: '2026-11-10T07:30:00Z', kind: 'prove', status: 'ikke_levert', activityType: 'prove' }),
  t({ source: 'teams', id: '3', title: 'Oppgavesett 3', courseName: 'Matte', dueAt: '2026-11-02T22:59:00Z', status: 'forfalt' }),
  t({ source: 'canvas', id: '4', title: 'Levert tekst', courseName: 'Norsk', dueAt: '2026-11-09T22:59:00Z', status: 'levert' }),
], NOW);

test('Prioritering: forfalte først, levert utelates', () => {
  const p = prioritize(tasks, NOW);
  assert.equal(p[0].task.title, 'Oppgavesett 3');
  assert.equal(p.some((x) => x.task.title === 'Levert tekst'), false);
});

test('Ukeplan: økter før frist, innenfor dagskapasitet', () => {
  const plan = weekPlan(tasks, NOW);
  for (const d of plan.days) {
    const hours = d.blocks.reduce((n, b) => n + (Number(b.end.slice(0, 2)) + Number(b.end.slice(3)) / 60 - Number(b.start.slice(0, 2)) - Number(b.start.slice(3)) / 60), 0);
    const dow = new Date(`${d.day}T12:00:00Z`).getUTCDay();
    assert.ok(hours <= (dow === 0 || dow === 6 ? 3 : 2) + 1e-9, `for mye på ${d.day}`);
    for (const b of d.blocks) assert.ok(b.day <= b.dueAt.slice(0, 10), `${b.title} planlagt etter frist`);
  }
  const prove = plan.days.flatMap((d) => d.blocks).filter((b) => b.title === 'Kapittelprøve vektorer');
  assert.ok(prove.length > 0 && prove.every((b) => b.day < '2026-11-10'));
  assert.equal(plan.days.flatMap((d) => d.blocks).some((b) => b.title === 'Levert tekst'), false);
});

test('Assistent: nevner bare oppgaver som finnes, og sier ifra når data mangler', () => {
  const txt = deterministicAnswer('oppsummer', tasks, [], NOW);
  assert.match(txt, /Novelleanalyse/);
  assert.match(txt, /Kapittelprøve vektorer/);
  assert.match(txt, /\[O\d+\]/);
  assert.match(deterministicAnswer('oppsummer', [], [], NOW), /finner ingen oppgaver/);
  assert.match(deterministicAnswer('kunngjoringer', tasks, [], NOW), /ingen kunngjøringer/);
});

test('Assistent: validering stopper oppdiktede referanser, datoer og karakterer', () => {
  const { ctx } = buildContext(tasks, [], NOW);
  const real = ctx.tasks[0];
  assert.equal(validateAnswer(`Start med ${real.title} [${real.ref}].`, ctx).ok, true);
  assert.equal(validateAnswer('Husk Tysk-innlevering [O99].', ctx).ok, false);
  assert.equal(validateAnswer('Du har prøve 3. des.', ctx).ok, false);
  assert.equal(validateAnswer('Karakteren er 6 i norsk.', ctx).ok, false);
  assert.doesNotMatch(JSON.stringify(ctx), /grade|karakter|fravær/i, 'karakterer og fravær sendes ikke til AI');
});

test('Egen status: Pågår og Ikke levert overstyrer «levert» fra Canvas; Ikke levert etter frist = forfalt', async () => {
  const { applyMyStatus, mergeStatus } = await import('../src/lib/unified');
  const [future] = unifyTasks([t({ source: 'canvas', id: '1', title: 'A', dueAt: '2026-11-20T10:00:00Z', status: 'levert' })], NOW);
  const p = applyMyStatus(future, 'pagar', NOW);
  assert.equal(p.status, 'pagar');
  assert.equal(p.sourceStatus, 'levert');
  assert.equal(applyMyStatus(future, 'ikke_levert', NOW).status, 'ikke_levert');
  const [past] = unifyTasks([t({ source: 'teams', id: '2', title: 'B', dueAt: '2026-11-01T10:00:00Z', status: 'levert' })], NOW);
  assert.equal(applyMyStatus(past, 'ikke_levert', NOW).status, 'forfalt');
  assert.equal(applyMyStatus(past, null, NOW).status, 'levert');
  assert.equal(mergeStatus(['pagar', 'ikke_levert'], '2026-11-20T10:00:00Z', NOW), 'pagar');
});

test('Leverte oppgaver: sist levert øverst, nyest til eldst', async () => {
  const { applyMyStatus, sortDelivered } = await import('../src/lib/unified');
  const tasks = unifyTasks([
    { ...t({ source: 'skolehub', id: 'a', title: 'Levert i går', dueAt: '2026-11-20T10:00:00Z', status: 'levert' }), submittedAt: '2026-11-06T18:00:00Z' },
    { ...t({ source: 'canvas', id: 'b', title: 'Levert for en uke siden', dueAt: '2026-11-25T10:00:00Z', status: 'levert' }), submittedAt: '2026-10-31T09:00:00Z' },
    t({ source: 'teams', id: 'c', title: 'Huket av nå', dueAt: '2026-10-01T10:00:00Z', status: 'ikke_levert' }),
    t({ source: 'canvas', id: 'd', title: 'Levert uten tidspunkt', dueAt: '2026-11-02T10:00:00Z', status: 'levert' }),
  ], NOW).map((x) => (x.title === 'Huket av nå' ? applyMyStatus(x, 'levert', NOW, '2026-11-07T10:59:00Z') : x));
  assert.deepEqual(sortDelivered(tasks).map((x) => x.title), ['Huket av nå', 'Levert i går', 'Levert for en uke siden', 'Levert uten tidspunkt']);
  // Settes tilbake til «Pågår»: ikke lenger levert, og tidspunktet fjernes
  assert.equal(applyMyStatus(tasks[1], 'pagar', NOW).deliveredAt, null);
});
