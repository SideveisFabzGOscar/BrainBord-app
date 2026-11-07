import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bellItems, priorityOf } from '../src/lib/bell';
import { unifyTasks, type TaskInput } from '../src/lib/unified';

const NOW = Date.parse('2026-11-07T11:00:00Z');
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const t = (id: string, days: number, status: TaskInput['status'] = 'ikke_levert'): TaskInput =>
  ({ source: 'canvas', id, title: `Oppgave ${id}`, courseName: 'Norsk', dueAt: at(days), kind: 'oppgave', status, url: null });

test('Prioritet: P1 utløpt, P2 0–7, P3 7–15, P4 15–30, ellers ingen', () => {
  assert.equal(priorityOf(at(-0.01), NOW), 1);
  assert.equal(priorityOf(at(0.5), NOW), 2);
  assert.equal(priorityOf(at(7), NOW), 2);
  assert.equal(priorityOf(at(7.5), NOW), 3);
  assert.equal(priorityOf(at(15), NOW), 3);
  assert.equal(priorityOf(at(20), NOW), 4);
  assert.equal(priorityOf(at(30), NOW), 4);
  assert.equal(priorityOf(at(31), NOW), null);
});

test('Sortert tidligst først, levert utelatt, varseltall = bare utløpte', () => {
  const tasks = unifyTasks([t('a', 20), t('b', -10), t('c', 3), t('d', -2), t('e', 10), t('f', 40), t('g', -5, 'levert')], NOW);
  const { items, lateCount } = bellItems(tasks, NOW);
  assert.deepEqual(items.map((i) => i.title), ['Oppgave b', 'Oppgave d', 'Oppgave c', 'Oppgave e', 'Oppgave a']);
  assert.deepEqual(items.map((i) => i.priority), [1, 1, 2, 3, 4]);
  assert.equal(lateCount, 2);
});

test('Oppgaver huket av som «Løst» forsvinner fra bjelle og plan', () => {
  const tasks = unifyTasks([t('x', -3), t('y', 2)], NOW).map((u) => (u.title === 'Oppgave x' ? { ...u, solvedAt: '2026-11-07T10:00:00Z' } : u));
  const { items, lateCount } = bellItems(tasks, NOW);
  assert.deepEqual(items.map((i) => i.title), ['Oppgave y']);
  assert.equal(lateCount, 0);
  assert.deepEqual(items[0].refs, [{ source: 'canvas', id: 'y' }]);
});
