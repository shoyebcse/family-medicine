import type { ScheduleInput } from '../domain/types';
import { toClockTime, type ReminderTime } from '../medicine/scheduleFields';
import { validatePrescription } from '../medicine/prescription';
import type { PrescriptionItem, Routine } from './types';

export function extractedReviewFields(item: PrescriptionItem): Record<string, string> {
  const dose = /^(\d{1,10}(?:\.\d{1,4})?)\s+(tablets?|capsules?|mL|ml|drops?|puffs?)$/i.exec(
    item.evidence.dose?.trim() || '',
  );
  return {
    ...(dose ? { quantity: dose[1], unit: dose[2] } : {}),
    ...(item.evidence.raw && item.evidence.raw.length <= 300
      ? { instruction: item.evidence.raw }
      : {}),
    ...item.fields,
  };
}

export function reminderFields(value?: string): ReminderTime[] {
  try {
    const times: unknown = JSON.parse(value || 'null');
    if (
      Array.isArray(times) &&
      times.length > 0 &&
      times.length <= 12 &&
      times.every(
        (time) =>
          time &&
          typeof time.hour === 'string' &&
          typeof time.minute === 'string' &&
          typeof time.period === 'string',
      )
    )
      return times;
  } catch {
    /* An unresolved draft must remain editable, not crash the screen. */
  }
  return [{ hour: '', minute: '', period: '' }];
}

export function reviewedSchedule(
  item: PrescriptionItem,
  memberId: string,
  routine: Routine,
): ScheduleInput {
  const fields = extractedReviewFields(item);
  const evidence = item.evidence;
  const clocks = reminderFields(fields.times).map(toClockTime);
  if (
    !evidence.brand?.trim() ||
    !evidence.dose?.trim() ||
    !evidence.frequency?.trim() ||
    !evidence.duration?.trim()
  )
    throw new Error(
      'Confirm the name, dose, frequency and duration. Missing instructions must remain drafts.',
    );
  if (evidence.sos)
    throw new Error('As-needed medicine cannot use a fixed alarm. Keep it as a draft.');
  if (evidence.unclear && !item.reviewNote?.trim())
    throw new Error('Describe how the unclear instructions were confirmed.');
  if (
    !fields.instruction?.trim() ||
    !fields.unit?.trim() ||
    !/^\d{1,10}(\.\d{1,4})?$/.test(fields.quantity || '') ||
    Number(fields.quantity) <= 0
  )
    throw new Error(
      'Enter confirmed full instructions, numeric amount and unit. Never copy a strength number as the dose.',
    );
  if (!clocks.length || clocks.some((time) => !time) || new Set(clocks).size !== clocks.length)
    throw new Error('Complete each distinct reminder time, including AM or PM.');
  const date = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (
    !date(fields.start || '') ||
    (fields.noEnd !== 'true' && (!date(fields.end || '') || fields.end < fields.start))
  )
    throw new Error('Choose valid treatment dates or confirm that no end date was specified.');
  const frequency =
    (
      {
        OD: 'Once daily',
        BD: 'Twice daily',
        TDS: 'Three times daily',
        QID: 'Four times daily',
        HS: 'Once daily',
      } as Record<string, string>
    )[evidence.frequency.trim().toUpperCase()] || evidence.frequency.trim();
  if (!['Once daily', 'Twice daily', 'Three times daily', 'Four times daily'].includes(frequency))
    throw new Error(
      'Enter a specific frequency: Once daily, Twice daily, Three times daily or Four times daily (OD, BD, TDS, QID and HS are also accepted). Daily alone does not specify how many doses. Keep unsupported regimens as drafts.',
    );
  if (
    evidence.pattern &&
    !['1-0-1', '1-1-1', '0-0-1', '1-0-0', '0-1-0'].includes(evidence.pattern.trim())
  )
    throw new Error(
      'This pattern may contain changing amounts. Keep it as a draft until a supported fixed plan is confirmed.',
    );
  if (
    evidence.pattern &&
    evidence.pattern.split('-').filter((value) => value === '1').length !== clocks.length
  )
    throw new Error('The confirmed times must match the written pattern.');
  const input: ScheduleInput = {
    memberId,
    medicineName: evidence.brand,
    strength: evidence.strength || '',
    doseInstruction: fields.instruction,
    doseQuantity: Number(fields.quantity),
    unit: fields.unit,
    times: clocks.sort(),
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    timezone: routine.timezone,
    startDate: fields.start,
    ...(fields.noEnd === 'true' ? {} : { endDate: fields.end }),
    noEndAcknowledged: fields.noEnd === 'true',
    reviewed: true,
    prescriptionDetails: {
      form: 'Not entered',
      route: 'Not entered',
      frequency,
      mealInstruction: evidence.food || 'Not specified',
      amountUnspecified: false,
      regimenType: 'FIXED',
    },
  };
  validatePrescription(input);
  return input;
}
