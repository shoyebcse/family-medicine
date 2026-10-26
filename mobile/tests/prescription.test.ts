import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePrescription } from '../src/medicine/prescription';
import type { ScheduleInput } from '../src/domain/types';

const input: ScheduleInput = {
  memberId: 'fictional',
  medicineName: 'Fictional liquid',
  strength: '125 mg/5 mL',
  doseInstruction: 'Original confirmed instruction',
  doseQuantity: 5,
  unit: 'mL',
  times: ['08:00'],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  timezone: 'Asia/Kolkata',
  startDate: '2026-10-20',
  endDate: '2026-10-21',
  noEndAcknowledged: false,
  reviewed: true,
  prescriptionDetails: {
    form: 'Liquid',
    route: 'By mouth',
    frequency: 'Once daily',
    mealInstruction: 'Not specified',
    amountUnspecified: false,
    regimenType: 'FIXED',
  },
};
test('liquid strength stays separate from amount and frequency cannot generate times', () => {
  validatePrescription(input);
  assert.equal(input.doseQuantity, 5);
  assert.equal(input.strength, '125 mg/5 mL');
  assert.throws(
    () =>
      validatePrescription({
        ...input,
        prescriptionDetails: { ...input.prescriptionDetails!, frequency: 'Twice daily' },
      }),
    /reminder times/,
  );
});
test('unknown dose cannot silently enable stock and variable plans cannot become fixed', () => {
  assert.throws(
    () => validatePrescription({ ...input, doseQuantity: undefined }),
    /prescribed amount/,
  );
  assert.throws(
    () =>
      validatePrescription({
        ...input,
        doseQuantity: undefined,
        initialStock: 100,
        prescriptionDetails: { ...input.prescriptionDetails!, amountUnspecified: true },
      }),
    /Stock tracking/,
  );
  for (const regimenType of ['VARIABLE', 'AS_NEEDED'] as const)
    assert.throws(
      () =>
        validatePrescription({
          ...input,
          prescriptionDetails: { ...input.prescriptionDetails!, regimenType },
        }),
      /not supported/,
    );
  validatePrescription({
    ...input,
    doseQuantity: undefined,
    prescriptionDetails: { ...input.prescriptionDetails!, amountUnspecified: true },
  });
});
