import type { ScheduleInput } from '../domain/types';

export function validatePrescription(input: ScheduleInput): void {
  const details = input.prescriptionDetails;
  if (!details) return;
  if (details.regimenType !== 'FIXED')
    throw new Error(
      'As-needed, tapering and variable-dose plans are not supported by this fixed schedule.',
    );
  if (
    !details.form.trim() ||
    !details.route.trim() ||
    !details.frequency.trim() ||
    !details.mealInstruction.trim()
  )
    throw new Error(
      'Choose the medicine form, route, frequency and meal instructions. Use Not specified when the prescription does not say.',
    );
  if (
    details.amountUnspecified ? input.doseQuantity !== undefined : input.doseQuantity === undefined
  )
    throw new Error('Enter the prescribed amount or explicitly mark it not specified.');
  if (details.amountUnspecified && input.initialStock !== undefined)
    throw new Error('Stock tracking needs a confirmed numeric amount.');
  const counts: Record<string, number> = {
    'Once daily': 1,
    'Twice daily': 2,
    'Three times daily': 3,
    'Four times daily': 4,
  };
  if (counts[details.frequency] && counts[details.frequency] !== input.times.length)
    throw new Error(
      'The number of reminder times must match the selected daily frequency. Confirm the exact times; they are not filled automatically.',
    );
}
