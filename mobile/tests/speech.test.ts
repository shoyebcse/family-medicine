import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenReminder } from '../src/reminders/speech';
import { DOSE_PREFIX } from '../src/reminders/types';
import type { Occurrence } from '../src/domain/types';

test('speech identifies the exact due occurrence and excludes resolved or missing doses', () => {
  const dose: Occurrence = {
    id: 'dose1',
    scheduleId: 'schedule1',
    memberId: 'member1',
    medicineName: 'DOLO',
    memberName: 'Mohammad Ahmad',
    strength: '',
    doseInstruction: 'Reviewed instructions',
    unit: 'tablet',
    timezone: 'Asia/Kolkata',
    dueAt: '2026-10-19T16:30:00Z',
    status: 'DUE',
  };
  const signal = { key: `${DOSE_PREFIX}dose1`, test: false };
  assert.equal(
    spokenReminder(signal, [dose]),
    'It is time for DOLO. Mohammad Ahmad, please take your medicine.',
  );
  assert.equal(
    spokenReminder(signal, [dose], 'hi-IN'),
    'Mohammad Ahmad, आपकी दवा DOLO लेने का समय हो गया है। कृपया अपनी दवा लें।',
  );
  assert.match(spokenReminder({ key: 'test', test: true }, [], 'hi-IN') ?? '', /परीक्षण/);
  assert.equal(spokenReminder(signal, []), null);
  for (const status of ['TAKEN', 'SKIPPED'] as const)
    assert.equal(spokenReminder(signal, [{ ...dose, status }]), null);
  assert.match(spokenReminder({ key: 'test', test: true }, []) ?? '', /only a test/);
});
