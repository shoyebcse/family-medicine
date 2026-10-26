import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingManualFields } from '../src/medicine/manualValidation';

const complete = {
  name: 'Fictional medicine',
  instruction: 'Confirmed instructions',
  regimen: 'Fixed amount at each scheduled time',
  unit: 'tablet',
  quantity: '1',
  amountUnspecified: false,
  frequency: 'Once daily',
  otherFrequency: '',
  times: [{ hour: '8', minute: '00', period: 'AM' }],
  start: '2026-10-23',
  end: '2026-10-25',
  noEnd: false,
  days: [1, 2, 3, 4, 5, 6, 7],
};
test('blank manual form identifies mandatory fields before unsupported-plan validation', () => {
  const missing = missingManualFields({
    ...complete,
    name: '',
    instruction: '',
    regimen: '',
    unit: '',
    quantity: '',
    frequency: '',
    times: [{ hour: '', minute: '', period: '' }],
    start: '',
    end: '',
  });
  assert.ok(missing.includes('Medicine name'));
  assert.ok(missing.includes('Type of medicine plan'));
  assert.ok(missing.includes('Prescribed frequency'));
  assert.ok(missing.includes('Confirmed start date'));
  assert.ok(missing.some((field) => field.startsWith('Reminder times')));
});
test('conditional required fields respect unknown amount and explicit no end date', () => {
  assert.deepEqual(missingManualFields(complete), []);
  assert.deepEqual(
    missingManualFields({
      ...complete,
      amountUnspecified: true,
      quantity: '',
      noEnd: true,
      end: '',
    }),
    [],
  );
  assert.deepEqual(missingManualFields({ ...complete, frequency: 'Other confirmed frequency' }), [
    'Frequency in clear words',
  ]);
  assert.ok(
    missingManualFields({ ...complete, times: [{ hour: '8', minute: '00', period: '' }] }).some(
      (field) => field.startsWith('Reminder times'),
    ),
  );
});
