import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BellItem, Priority } from '../src/lib/bell';
import { catchUpPlan, firstSchoolDay, moodOf } from '../src/lib/catchup';

const NOW = Date.parse('2026-11-07T11:00:00Z'); // lørdag
const item = (key: string, p: Priority, dueAt: string): BellItem =>
  ({ key, refs: [{ source: 'canvas', id: key }], title: key, courseName: null, dueAt, kind: 'oppgave', priority: p, late: p === 1, sources: ['canvas'], open: null });

test('Starter mandag når det er helg, og hopper over helger', () => {
  assert.equal(firstSchoolDay(NOW), '2026-11-09');
  assert.equal(firstSchoolDay(Date.parse('2026-11-11T08:00:00Z')), '2026-11-11'); // onsdag = i dag
});

test('P1 først (tidligst frist), så P2; maks 2 per dag, mandag–fredag, til alt er med', () => {
  const items = [
    item('p2-a', 2, '2026-11-10T22:00:00Z'), item('p1-b', 1, '2026-11-01T22:00:00Z'), item('p1-a', 1, '2026-10-20T22:00:00Z'),
    item('p1-c', 1, '2026-11-05T22:00:00Z'), item('p2-b', 2, '2026-11-13T22:00:00Z'), item('p1-d', 1, '2026-11-06T22:00:00Z'),
    item('p2-c', 2, '2026-11-14T10:00:00Z'), item('p1-e', 1, '2026-11-06T23:30:00Z'), item('p2-d', 2, '2026-11-14T12:00:00Z'),
    item('p2-e', 2, '2026-11-14T13:00:00Z'), item('p2-f', 2, '2026-11-14T14:00:00Z'), item('p3', 3, '2026-11-20T10:00:00Z'),
  ];
  const plan = catchUpPlan(items, NOW);
  assert.equal(plan.mode, 'ajour');
  assert.equal(plan.mood, 1);
  assert.equal(plan.total, 11, 'P3 tas ikke med når det finnes P1/P2');
  assert.deepEqual(plan.days.map((d) => d.date), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16']);
  assert.ok(plan.days.every((d) => d.items.length <= 2));
  assert.deepEqual(plan.days.flatMap((d) => d.items.map((i) => i.key)),
    ['p1-a', 'p1-b', 'p1-c', 'p1-d', 'p1-e', 'p2-a', 'p2-b', 'p2-c', 'p2-d', 'p2-e', 'p2-f']);
  // p2-a (frist 10. nov) havner onsdag 11. nov fordi P1 går først: skal merkes
  assert.equal(plan.days[2].items.find((i) => i.key === 'p2-a')!.afterDeadline, true);
  assert.ok(plan.lateScheduled >= 1);
});

test('À jour (ingen P1/P2): plan for P3 og P4 for å komme i forkant', () => {
  const plan = catchUpPlan([item('p4', 4, '2026-12-01T10:00:00Z'), item('p3', 3, '2026-11-18T10:00:00Z')], NOW);
  assert.equal(plan.mode, 'forkant');
  assert.equal(plan.mood, 3);
  assert.deepEqual(plan.days[0].items.map((i) => i.key), ['p3', 'p4']);
});

test('Humør: P1 rød sur, P2 lyserød strek, P3 lysegrønn smil, P4/ingenting mørkegrønn', () => {
  assert.equal(moodOf([{ priority: 2 }, { priority: 1 }]), 1);
  assert.equal(moodOf([{ priority: 2 }, { priority: 4 }]), 2);
  assert.equal(moodOf([{ priority: 3 }, { priority: 4 }]), 3);
  assert.equal(moodOf([{ priority: 4 }]), 4);
  assert.equal(moodOf([]), 4);
  assert.equal(catchUpPlan([], NOW).mode, 'ferdig');
});
