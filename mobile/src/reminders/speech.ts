import type { Occurrence } from '../domain/types';
import { DOSE_PREFIX, type ReminderSignal } from './types';
import { doseMessage, testMessage, type AlarmLanguage } from './language';

export function spokenReminder(
  signal: ReminderSignal,
  doses: Occurrence[],
  language: AlarmLanguage = 'en-IN',
): string | null {
  if (signal.test) return testMessage(language);
  const dose = doses.find((item) => `${DOSE_PREFIX}${item.id}` === signal.key);
  if (!dose || dose.status === 'TAKEN' || dose.status === 'SKIPPED') return null;
  return doseMessage(dose.medicineName, dose.memberName, language);
}
