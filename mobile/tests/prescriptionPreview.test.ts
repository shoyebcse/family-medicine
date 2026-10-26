import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewedCandidates, requireReviewedCandidates } from '../src/prescriptions/preview';
import type { PrescriptionItem } from '../src/prescriptions/types';
import { EMPTY_MEDICINE } from '../src/prescriptions/rules';
import { reviewedSchedule } from '../src/prescriptions/review';

test('preview requires a human-reviewed schedule and excludes already activated plans', () => {
  const draft: PrescriptionItem = {
    id: 'draft',
    evidence: {
      ...EMPTY_MEDICINE,
      brand: 'Fictional',
      dose: '1 tablet',
      frequency: 'BD',
      duration: '5 days',
      unclear: false,
    },
    fields: {},
    verified: false,
    schedule: null,
  };
  const reviewed: PrescriptionItem = {
    ...draft,
    id: 'reviewed',
    verified: true,
    schedule: reviewedSchedule(
      {
        ...draft,
        fields: {
          instruction: 'Confirmed instructions',
          quantity: '1',
          unit: 'tablet',
          start: '2026-10-23',
          end: '2026-10-28',
          times: JSON.stringify([
            { hour: '8', minute: '00', period: 'AM' },
            { hour: '8', minute: '00', period: 'PM' },
          ]),
        },
      },
      'patient',
      { timezone: 'Asia/Kolkata' },
    ),
  };
  assert.throws(
    () => requireReviewedCandidates([draft], {}),
    /I reviewed and confirm this medicine/,
  );
  assert.throws(
    () => requireReviewedCandidates([{ ...draft, verified: true }], {}),
    /No medicines are reviewed/,
  );
  assert.deepEqual(
    reviewedCandidates([draft, reviewed], {}).map((item) => item.id),
    ['reviewed'],
  );
  assert.deepEqual(reviewedCandidates([reviewed], { reviewed: 'saved-plan' }), []);
  assert.throws(
    () => requireReviewedCandidates([reviewed], { reviewed: 'saved-plan' }),
    /already have saved plans/,
  );
});
