import type { ReminderTime } from './scheduleFields';

export function missingManualFields(input: {
  name: string;
  instruction: string;
  regimen: string;
  unit: string;
  quantity: string;
  amountUnspecified: boolean;
  frequency: string;
  otherFrequency: string;
  times: ReminderTime[];
  start: string;
  end: string;
  noEnd: boolean;
  days: number[];
}): string[] {
  const missing: string[] = [];
  if (!input.name.trim()) missing.push('Medicine name');
  if (!input.instruction.trim()) missing.push('Original confirmed prescription instructions');
  if (!input.regimen) missing.push('Type of medicine plan');
  if (!input.unit.trim()) missing.push('Unit for the amount taken');
  if (!input.amountUnspecified && !input.quantity.trim())
    missing.push('Amount each time (or confirm no numeric amount is specified)');
  if (!input.frequency) missing.push('Prescribed frequency');
  if (input.frequency === 'Other confirmed frequency' && !input.otherFrequency.trim())
    missing.push('Frequency in clear words');
  if (
    !input.times.length ||
    input.times.some((time) => !time.hour.trim() || !time.minute.trim() || !time.period)
  )
    missing.push('Reminder times (hour, minute and AM/PM)');
  if (!input.days.length) missing.push('At least one weekday');
  if (!input.start) missing.push('Confirmed start date');
  if (!input.noEnd && !input.end)
    missing.push('Last treatment date (or confirm no end date specified)');
  return missing;
}
