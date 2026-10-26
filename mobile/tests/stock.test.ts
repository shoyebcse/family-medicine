import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLowStock, StockEpisodes, validateStockThreshold } from '../src/stock/rules';
import type { Schedule } from '../src/domain/types';
const schedule: Schedule = {
  id: 'stock-test',
  memberId: 'fictional',
  medicineName: 'Fictional medicine',
  strength: 'sample',
  doseInstruction: 'sample',
  unit: 'tablet',
  timezone: 'Asia/Kolkata',
  stock: 5,
  lowStockThreshold: 5,
};
test('low stock includes equality, depletion and negative estimates; disabled tracking never alerts', () => {
  assert.equal(isLowStock(schedule), true);
  assert.equal(isLowStock({ ...schedule, stock: 6 }), false);
  assert.equal(isLowStock({ ...schedule, stock: 0, lowStockThreshold: 0 }), true);
  assert.equal(isLowStock({ ...schedule, stock: -1 }), true);
  assert.equal(isLowStock({ ...schedule, stock: undefined }), false);
  assert.equal(isLowStock({ ...schedule, lowStockThreshold: undefined }), false);
  assert.equal(isLowStock({ ...schedule, stock: 0.1 + 0.2, lowStockThreshold: 0.3 }), true);
  assert.equal(isLowStock({ ...schedule, lowStock: false }), false);
});
test('refresh and dose retries alert once per episode; disabling or recovering re-arms', () => {
  const episodes = new StockEpisodes();
  assert.equal(episodes.next([schedule]).length, 1);
  assert.equal(episodes.next([schedule]).length, 0);
  episodes.next([{ ...schedule, stock: 10 }]);
  assert.equal(episodes.next([schedule]).length, 1);
  episodes.next([]);
  assert.equal(episodes.next([schedule]).length, 1);
});
test('thresholds require same-unit tracked stock and a confirmed quantity', () => {
  validateStockThreshold(0, 10, 1);
  validateStockThreshold(undefined);
  assert.throws(() => validateStockThreshold(5, undefined, 1), /tracked stock/);
  assert.throws(() => validateStockThreshold(5, 10, undefined), /dose quantity/);
  assert.throws(() => validateStockThreshold(-1, 10, 1), /threshold/);
  assert.throws(() => validateStockThreshold(0.12345, 10, 1), /four decimal/);
});
