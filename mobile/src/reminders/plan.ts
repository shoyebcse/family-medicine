import type { Occurrence } from '../domain/types';
import { DOSE_PREFIX, type ReminderRegistration } from './types';
import { doseMessage, type AlarmLanguage } from './language';

export const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_LATE_MS = 60_000;

/** Work from UTC instants of reviewed occurrences; never infer a treatment time. */
export function planReminders(
  doses: Occurrence[],
  now: number,
  capacity: number,
  language: AlarmLanguage = 'en-IN',
) {
  const unique = new Map<string, ReminderRegistration>();
  for (const dose of doses) {
    if (dose.status === 'TAKEN' || dose.status === 'SKIPPED') continue;
    const dueAt = Date.parse(dose.dueAt);
    if (!Number.isFinite(dueAt) || dueAt <= now || dueAt > now + HORIZON_MS) continue;
    const key = `${DOSE_PREFIX}${dose.id}`;
    const previous = unique.get(key);
    if (previous && previous.dueAt !== dueAt)
      throw new Error('Conflicting reminder times. Refresh the medicine plan.');
    unique.set(key, {
      key,
      dueAt,
      message: doseMessage(dose.medicineName, dose.memberName, language),
      language,
    });
  }
  const upcoming = [...unique.values()].sort(
    (a, b) => a.dueAt - b.dueAt || a.key.localeCompare(b.key),
  );
  const selected = upcoming.slice(0, Math.max(0, Math.floor(capacity)));
  return { selected, omitted: upcoming.length - selected.length };
}

/** Sleeping/reconnected browsers must not replay a backlog of alerts. */
export function shouldPresent(dueAt: number, now: number) {
  return now >= dueAt && now - dueAt < MAX_LATE_MS;
}
