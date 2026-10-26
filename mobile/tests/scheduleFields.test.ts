import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarMonth, clockTimeLabel, toClockTime } from '../src/medicine/scheduleFields';

test('AM/PM preserves midnight, noon and evening schedule times', () => {
  for (const [hour, minute, period, expected] of [
    ['12', '00', 'AM', '00:00'],
    ['12', '00', 'PM', '12:00'],
    ['2', '30', 'PM', '14:30'],
    ['08', '05', 'AM', '08:05'],
  ]) {
    assert.equal(toClockTime({ hour, minute, period }), expected);
  }
  assert.equal(clockTimeLabel('00:00'), '12:00 AM');
  assert.equal(clockTimeLabel('12:00'), '12:00 PM');
  assert.equal(clockTimeLabel('14:30'), '2:30 PM');
});

test('incomplete or invalid time never becomes an assumed reminder', () => {
  for (const time of [
    { hour: '8', minute: '00', period: '' },
    { hour: '0', minute: '00', period: 'AM' },
    { hour: '13', minute: '00', period: 'PM' },
    { hour: '8', minute: '60', period: 'AM' },
    { hour: '8', minute: '', period: 'PM' },
  ])
    assert.equal(toClockTime(time), '');
});

test('calendar includes leap days, aligns Monday first, and handles year rollover', () => {
  const leap = calendarMonth(2028, 1);
  assert.equal(leap.filter(Boolean).length, 29);
  assert.equal(leap[0], null);
  assert.equal(leap[1], '2028-02-01');
  assert.equal(leap.at(-1), '2028-02-29');
  assert.equal(calendarMonth(2027, 1).filter(Boolean).length, 28);
  assert.equal(calendarMonth(2026, 12).find(Boolean), '2027-01-01');
});
