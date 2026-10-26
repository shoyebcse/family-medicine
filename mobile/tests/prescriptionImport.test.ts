import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_MEDICINE, proposeTimes } from '../src/prescriptions/rules';
import type { ExtractedMedicine, PrescriptionItem } from '../src/prescriptions/types';
import {
  reminderFields,
  reviewedSchedule,
  extractedReviewFields,
} from '../src/prescriptions/review';

const medicine: ExtractedMedicine = {
  ...EMPTY_MEDICINE,
  brand: 'Fictional medicine',
  dose: '1 tablet',
  frequency: 'BD',
  duration: '5 days',
  timing: ['morning', 'evening'],
  unclear: false,
};
test('routine uses per-patient override and exposes fallback only for missing activities', () => {
  const result = proposeTimes(medicine, { breakfast: '08:00', timezone: 'Asia/Kolkata' });
  assert.deepEqual(result.times, ['08:00', '20:30']);
  assert.match(result.messages[0], /patient breakfast time: 8:00 AM/);
  assert.match(result.messages[1], /default dinner time: 8:30 PM/);
  assert.deepEqual(
    proposeTimes(
      { ...medicine, timing: ['afternoon', 'bedtime'] },
      { lunch: '14:00', timezone: 'Asia/Kolkata' },
    ).times,
    ['14:00', '22:30'],
  );
});
test('written exact times override routines including midnight and noon', () => {
  const result = proposeTimes(
    { ...medicine, timing: ['12:00 AM', '12:00 PM'] },
    { breakfast: '08:00', timezone: 'Asia/Kolkata' },
  );
  assert.deepEqual(result.times, ['00:00', '12:00']);
  assert.match(result.messages[0], /written clock times/);
});
test('missing instructions, SOS, unknown timing and food intervals cannot invent schedules', () => {
  for (const value of [
    { ...medicine, dose: null },
    { ...medicine, frequency: null },
    { ...medicine, duration: null },
    { ...medicine, sos: true },
    { ...medicine, timing: [] },
    { ...medicine, timing: ['08:00', 'bedtime'] },
    { ...medicine, food: 'PC' },
    { ...medicine, food: 'before breakfast' },
    { ...medicine, frequency: 'every 8 hours' },
  ]) {
    assert.throws(() => proposeTimes(value, { timezone: 'Asia/Kolkata' }));
  }
  assert.equal(EMPTY_MEDICINE.dose, null);
  assert.equal(EMPTY_MEDICINE.strength, null);
  assert.equal(EMPTY_MEDICINE.unclear, true);
});

test('review requires explicit amount, dates, AM/PM and uncertainty resolution; strength never fills amount', () => {
  const item: PrescriptionItem = {
    id: 'fictional',
    evidence: { ...medicine, strength: '500 mg', pattern: '1-0-1' },
    verified: false,
    schedule: null,
    fields: {
      instruction: 'Confirmed fictional instructions',
      quantity: '1',
      unit: 'tablet',
      start: '2026-10-22',
      end: '2026-10-27',
      times: JSON.stringify([
        { hour: '8', minute: '00', period: 'AM' },
        { hour: '8', minute: '00', period: 'PM' },
      ]),
    },
  };
  const input = reviewedSchedule(item, 'member-a', { timezone: 'Asia/Kolkata' });
  assert.equal(input.doseQuantity, 1);
  assert.equal(input.strength, '500 mg');
  assert.deepEqual(input.times, ['08:00', '20:00']);
  assert.equal(input.prescriptionDetails?.frequency, 'Twice daily');
  assert.throws(() =>
    reviewedSchedule({ ...item, fields: { ...item.fields, quantity: '' } }, 'member-a', {
      timezone: 'Asia/Kolkata',
    }),
  );
  assert.throws(() =>
    reviewedSchedule({ ...item, evidence: { ...item.evidence, unclear: true } }, 'member-a', {
      timezone: 'Asia/Kolkata',
    }),
  );
  assert.throws(() =>
    reviewedSchedule({ ...item, evidence: { ...item.evidence, pattern: '1-1-2' } }, 'member-a', {
      timezone: 'Asia/Kolkata',
    }),
  );
  assert.throws(() =>
    reviewedSchedule(
      { ...item, evidence: { ...item.evidence, frequency: 'every 8 hours' } },
      'member-a',
      { timezone: 'Asia/Kolkata' },
    ),
  );
  assert.throws(() =>
    reviewedSchedule({ ...item, fields: { ...item.fields, start: '2026-02-30' } }, 'member-a', {
      timezone: 'Asia/Kolkata',
    }),
  );
  assert.deepEqual(reminderFields('malformed'), [{ hour: '', minute: '', period: '' }]);
  assert.equal(
    extractedReviewFields({
      ...item,
      evidence: { ...medicine, dose: null, strength: '500 mg' },
      fields: {},
    }).quantity,
    undefined,
  );
  assert.equal(
    extractedReviewFields({
      ...item,
      evidence: { ...medicine, dose: '5 mL', strength: '125 mg/5 mL' },
      fields: {},
    }).quantity,
    '5',
  );
  assert.equal(
    extractedReviewFields({ ...item, evidence: { ...medicine, dose: '5 mL' }, fields: {} }).unit,
    'mL',
  );
});
