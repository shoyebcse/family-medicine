import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterHistory, historyStatus } from '../src/prescriptions/history';
import type { Prescription } from '../src/prescriptions/types';
const prescription = (
  id: string,
  createdAt: string,
  plans: Record<string, string>,
): Prescription => ({
  id,
  memberId: 'fictional',
  createdAt,
  plans,
  status: 'REVIEW_REQUIRED',
  version: 1,
  extraction: { patient: { name: null }, doctor: { name: null }, date: null, medicines: [] },
  sources: [],
  items: ['a', 'b'].map((itemId) => ({
    id: itemId,
    verified: false,
    schedule: null,
    evidence: {
      raw: null,
      brand: null,
      strength: null,
      dose: null,
      frequency: null,
      pattern: null,
      timing: [],
      food: null,
      duration: null,
      sos: false,
      unclear: true,
    },
  })),
});
test('history sorts newest first without mutating records and preserves partial review in both filters', () => {
  const draft = prescription('draft', '2026-10-21T10:00:00Z', {});
  const partial = prescription('partial', '2026-10-23T10:00:00Z', { a: 'schedule-a' });
  const scheduled = prescription('scheduled', '2026-10-22T10:00:00Z', {
    a: 'schedule-a',
    b: 'schedule-b',
  });
  const history = [draft, partial, scheduled];
  assert.deepEqual(
    filterHistory(history, 'All').map((item) => item.id),
    ['partial', 'scheduled', 'draft'],
  );
  assert.deepEqual(
    filterHistory(history, 'Review needed').map((item) => item.id),
    ['partial', 'draft'],
  );
  assert.deepEqual(
    filterHistory(history, 'With schedules').map((item) => item.id),
    ['partial', 'scheduled'],
  );
  assert.deepEqual(
    history.map((item) => item.id),
    ['draft', 'partial', 'scheduled'],
  );
  assert.equal(historyStatus(draft), 'Review needed');
  assert.equal(historyStatus(partial), 'Partly scheduled');
  assert.equal(historyStatus(scheduled), 'Schedules created');
});
