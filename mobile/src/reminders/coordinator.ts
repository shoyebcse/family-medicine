import type { Occurrence } from '../domain/types';
import { planReminders, shouldPresent } from './plan';
import type { AlarmLanguage } from './language';
import {
  DOSE_PREFIX,
  PENDING_BUDGET,
  TEST_PREFIX,
  type ReminderAdapter,
  type ReminderReport,
} from './types';

export class ReminderCoordinator {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly adapter: ReminderAdapter,
    private readonly now: () => number = Date.now,
  ) {}

  /** Serialize reconciliations so old work cannot finish after a newer disable/edit. */
  reconcile(
    doses: Occurrence[],
    enabled: boolean,
    language: AlarmLanguage = 'en-IN',
  ): Promise<ReminderReport> {
    const task = this.tail.catch(() => undefined).then(() => this.apply(doses, enabled, language));
    this.tail = task;
    return task;
  }

  private async apply(
    doses: Occurrence[],
    enabled: boolean,
    language: AlarmLanguage,
  ): Promise<ReminderReport> {
    const now = this.now();
    const existing = await this.adapter.list();
    const capabilities = await this.adapter.inspect();
    const unrelated = existing.filter((r) => !r.key.startsWith(DOSE_PREFIX)).length;
    // A refresh can win the race against the adapter's delivery timer. Preserve
    // existing due alerts briefly, but never recreate alerts already dispatched.
    const dispatching =
      enabled && capabilities.canSchedule
        ? existing.filter(
            (registration) =>
              registration.key.startsWith(DOSE_PREFIX) &&
              shouldPresent(registration.dueAt, now) &&
              doses.some(
                (dose) =>
                  registration.key === `${DOSE_PREFIX}${dose.id}` &&
                  Date.parse(dose.dueAt) === registration.dueAt &&
                  dose.status !== 'TAKEN' &&
                  dose.status !== 'SKIPPED',
              ),
          )
        : [];
    const { selected, omitted } = planReminders(
      doses,
      now,
      Math.max(0, PENDING_BUDGET - 4 - unrelated - dispatching.length),
      language,
    );
    const desired = enabled && capabilities.canSchedule ? selected : [];
    const wanted = new Map([...desired, ...dispatching].map((r) => [r.key, r]));
    for (const registration of existing) {
      if (registration.key.startsWith(TEST_PREFIX) && !enabled)
        await this.adapter.cancel(registration.key);
      if (!registration.key.startsWith(DOSE_PREFIX)) continue;
      const replacement = wanted.get(registration.key);
      if (!replacement || replacement.dueAt !== registration.dueAt)
        await this.adapter.cancel(registration.key);
    }
    const previous = new Map(existing.map((r) => [r.key, r]));
    for (const registration of desired) {
      if (
        previous.get(registration.key)?.dueAt !== registration.dueAt ||
        (capabilities.backgroundSpeech &&
          previous.get(registration.key)?.message !== registration.message)
      )
        await this.adapter.schedule(registration);
    }
    const installed = (await this.adapter.list()).filter(
      (r) => r.key.startsWith(DOSE_PREFIX) && wanted.has(r.key) && r.dueAt > this.now(),
    );
    return {
      count: installed.length,
      nextDueAt: installed.length ? Math.min(...installed.map((r) => r.dueAt)) : null,
      lastScheduledAt: installed.length ? Math.max(...installed.map((r) => r.dueAt)) : null,
      omitted: enabled && capabilities.canSchedule ? omitted : 0,
      reconciledAt: this.now(),
    };
  }
}
