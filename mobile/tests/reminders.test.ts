import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Occurrence } from '../src/domain/types';
import { HORIZON_MS, planReminders, shouldPresent } from '../src/reminders/plan';
import { ReminderCoordinator } from '../src/reminders/coordinator';
import {
  DOSE_PREFIX,
  TEST_PREFIX,
  type ReminderAdapter,
  type ReminderCapabilities,
  type ReminderRegistration,
} from '../src/reminders/types';

const NOW = Date.parse('2026-10-19T12:00:00Z');
test('Hindi changes spoken payload without changing occurrence keys or due times', async () => {
  const adapter = new FakeAdapter();
  const inspect = adapter.inspect.bind(adapter);
  adapter.inspect = async () => ({ ...(await inspect()), backgroundSpeech: true });
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  const doses = [dose('hindi', 60000)];
  await coordinator.reconcile(doses, true, 'en-IN');
  const original = { ...adapter.items.values().next().value! };
  await coordinator.reconcile(doses, true, 'hi-IN');
  const translated = adapter.items.values().next().value!;
  assert.equal(translated.key, original.key);
  assert.equal(translated.dueAt, original.dueAt);
  assert.match(translated.message ?? '', /दवा/);
  assert.equal(adapter.scheduled.length, 2);
  await coordinator.reconcile(doses, true, 'hi-IN');
  assert.equal(adapter.scheduled.length, 2, 'same language must not duplicate alarm registrations');
});
function dose(id: string, offset: number, status: Occurrence['status'] = 'UPCOMING'): Occurrence {
  return {
    id,
    scheduleId: 's1',
    memberId: 'm1',
    memberName: 'Example member',
    medicineName: 'Example medicine',
    strength: '',
    doseInstruction: 'Confirmed text',
    unit: 'tablet',
    timezone: 'Asia/Kolkata',
    dueAt: new Date(NOW + offset).toISOString(),
    status,
  };
}
class FakeAdapter implements ReminderAdapter {
  items = new Map<string, ReminderRegistration>();
  scheduled: string[] = [];
  cancelled: string[] = [];
  allowed = true;
  async inspect(): Promise<ReminderCapabilities> {
    return {
      platform: 'native',
      notifications: this.allowed ? 'granted' : 'denied',
      exactAlarm: this.allowed,
      sound: true,
      canSchedule: this.allowed,
    };
  }
  async enable() {}
  async restoreEnabled() {
    return false;
  }
  async saveEnabled(_enabled: boolean) {}
  async requestDesktopPermission() {}
  async list() {
    return [...this.items.values()];
  }
  async schedule(item: ReminderRegistration) {
    this.scheduled.push(item.key);
    this.items.set(item.key, item);
  }
  async cancel(key: string) {
    this.cancelled.push(key);
    this.items.delete(key);
  }
  async test() {}
  stopSound() {}
  subscribe() {
    return () => undefined;
  }
  dispose() {}
}

test('does not schedule taken, skipped, overdue or outside-horizon doses', () => {
  const result = planReminders(
    [
      dose('taken', 1000, 'TAKEN'),
      dose('skipped', 1000, 'SKIPPED'),
      dose('old', -1000),
      dose('far', HORIZON_MS + 1),
      dose('valid', 1000),
    ],
    NOW,
    60,
  );
  assert.deepEqual(
    result.selected.map((x) => x.key),
    [`${DOSE_PREFIX}valid`],
  );
});
test('allocates earliest doses across members and reports omitted reminders', () => {
  const items = [
    dose('late', 3000),
    { ...dose('other-member', 1000), memberId: 'm2' },
    dose('middle', 2000),
  ];
  const result = planReminders(items, NOW, 2);
  assert.deepEqual(
    result.selected.map((x) => x.key),
    [`${DOSE_PREFIX}other-member`, `${DOSE_PREFIX}middle`],
  );
  assert.equal(result.omitted, 1);
});
test('equal occurrence IDs deduplicate but conflicting times fail visibly', () => {
  assert.equal(planReminders([dose('a', 1000), dose('a', 1000)], NOW, 60).selected.length, 1);
  assert.throws(() => planReminders([dose('a', 1000), dose('a', 2000)], NOW, 60), /Conflicting/);
});
test('a seven-day boundary is inclusive and nonpositive capacity installs nothing', () => {
  assert.equal(planReminders([dose('boundary', HORIZON_MS)], NOW, 1).selected.length, 1);
  assert.equal(planReminders([dose('a', 1000)], NOW, 0).selected.length, 0);
});
test('sleeping browsers do not replay old alerts', () => {
  assert.equal(shouldPresent(NOW, NOW - 1), false);
  assert.equal(shouldPresent(NOW, NOW), true);
  assert.equal(shouldPresent(NOW, NOW + 59_999), true);
  assert.equal(shouldPresent(NOW, NOW + 60_000), false);
});
test('repeated reconciliations register each dose once', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  await coordinator.reconcile([dose('a', 1000)], true);
  const result = await coordinator.reconcile([dose('a', 1000)], true);
  assert.equal(adapter.scheduled.length, 1);
  assert.equal(result.count, 1);
  assert.equal(result.nextDueAt, NOW + 1000);
});
test('Taken cancels its alert without affecting later doses', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  await coordinator.reconcile([dose('a', 1000), dose('b', 2000)], true);
  await coordinator.reconcile([dose('a', 1000, 'TAKEN'), dose('b', 2000)], true);
  assert.deepEqual(adapter.cancelled, [`${DOSE_PREFIX}a`]);
  assert.equal(adapter.items.has(`${DOSE_PREFIX}b`), true);
});
test('accepted changes replace obsolete times and deleted occurrences', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  await coordinator.reconcile([dose('a', 1000), dose('b', 2000)], true);
  await coordinator.reconcile([dose('a', 5000)], true);
  assert.equal(adapter.items.get(`${DOSE_PREFIX}a`)?.dueAt, NOW + 5000);
  assert.equal(adapter.items.has(`${DOSE_PREFIX}b`), false);
});
test('permission revocation cancels owned alerts', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  await coordinator.reconcile([dose('a', 1000)], true);
  adapter.allowed = false;
  assert.equal((await coordinator.reconcile([dose('a', 1000)], true)).count, 0);
  assert.equal(adapter.items.size, 0);
});
test('disable cancels dose and test alerts while preserving unrelated registrations', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  adapter.items.set('other-feature', { key: 'other-feature', dueAt: NOW + 1000 });
  adapter.items.set(`${TEST_PREFIX}native`, { key: `${TEST_PREFIX}native`, dueAt: NOW + 5000 });
  await coordinator.reconcile([dose('a', 1000)], true);
  await coordinator.reconcile([], false);
  assert.deepEqual([...adapter.items.keys()], ['other-feature']);
});
test('a later disable wins over an in-progress enable reconciliation', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  await Promise.all([
    coordinator.reconcile([dose('a', 1000)], true),
    coordinator.reconcile([], false),
  ]);
  assert.equal(adapter.items.size, 0);
});
test('other registrations reduce the app budget and coverage is actual installed coverage', async () => {
  const adapter = new FakeAdapter();
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  for (let i = 0; i < 55; i++)
    adapter.items.set(`other-${i}`, { key: `other-${i}`, dueAt: NOW + 1000 });
  const result = await coordinator.reconcile([dose('a', 1000), dose('b', 2000)], true);
  assert.equal(result.count, 1);
  assert.equal(result.omitted, 1);
  assert.equal(result.lastScheduledAt, NOW + 1000);
});

test('refresh at the exact due instant preserves an already-registered alert for dispatch', async () => {
  const adapter = new FakeAdapter();
  let now = NOW;
  const coordinator = new ReminderCoordinator(adapter, () => now);
  await coordinator.reconcile([dose('a', 1000)], true);
  now = NOW + 1000;
  await coordinator.reconcile([dose('a', 1000, 'DUE')], true);
  assert.equal(adapter.items.has(`${DOSE_PREFIX}a`), true);
  assert.deepEqual(adapter.cancelled, []);
});

test('background speech registrations contain current names and update when names change', async () => {
  const adapter = new FakeAdapter();
  const status = await adapter.inspect();
  adapter.inspect = async () => ({ ...status, backgroundSpeech: true });
  const coordinator = new ReminderCoordinator(adapter, () => NOW);
  const initial = { ...dose('named', 10000), medicineName: 'DOLO', memberName: 'Mohammad Ahmad' };
  await coordinator.reconcile([initial], true);
  assert.equal(
    adapter.items.get(`${DOSE_PREFIX}named`)?.message,
    'It is time for DOLO. Mohammad Ahmad, please take your medicine.',
  );
  await coordinator.reconcile([initial], true);
  assert.equal(adapter.scheduled.length, 1);
  await coordinator.reconcile([{ ...initial, memberName: 'Example member' }], true);
  assert.equal(adapter.scheduled.length, 2);
  assert.match(adapter.items.get(`${DOSE_PREFIX}named`)?.message ?? '', /Example member/);
});

test('a just-due alert is not recreated after the adapter has dispatched it', async () => {
  const adapter = new FakeAdapter();
  let now = NOW;
  const coordinator = new ReminderCoordinator(adapter, () => now);
  await coordinator.reconcile([dose('a', 1000)], true);
  adapter.items.delete(`${DOSE_PREFIX}a`);
  now = NOW + 1200;
  await coordinator.reconcile([dose('a', 1000, 'DUE')], true);
  assert.equal(adapter.items.size, 0);
  assert.equal(adapter.scheduled.length, 1);
});

test('dispatch grace does not keep Taken, removed, or expired alerts', async () => {
  for (const kind of ['taken', 'removed', 'expired']) {
    const adapter = new FakeAdapter();
    let now = NOW;
    const coordinator = new ReminderCoordinator(adapter, () => now);
    await coordinator.reconcile([dose('a', 1000)], true);
    now = kind === 'expired' ? NOW + 61_000 : NOW + 1000;
    await coordinator.reconcile(
      kind === 'removed' ? [] : [dose('a', 1000, kind === 'taken' ? 'TAKEN' : 'DUE')],
      true,
    );
    assert.equal(adapter.items.size, 0, kind);
  }
});
