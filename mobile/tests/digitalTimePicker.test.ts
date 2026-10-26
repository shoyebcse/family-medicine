import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepTimePart, toClockTime } from '../src/medicine/scheduleFields';

test('digital arrows wrap each column without changing the other time components', () => {
  assert.equal(stepTimePart('12', 'hour', 1), '01');
  assert.equal(stepTimePart('01', 'hour', -1), '12');
  assert.equal(stepTimePart('59', 'minute', 1), '00');
  assert.equal(stepTimePart('00', 'minute', -1), '59');
  const selected = { hour: '12', minute: '59', period: 'PM' };
  const changed = { ...selected, minute: stepTimePart(selected.minute, 'minute', 1) };
  assert.deepEqual(changed, { hour: '12', minute: '00', period: 'PM' });
  assert.equal(toClockTime(changed), '12:00');
  assert.deepEqual(selected, { hour: '12', minute: '59', period: 'PM' });
});
test('blank and invalid columns require explicit selection and never assume AM or PM', () => {
  assert.equal(stepTimePart('', 'hour', 1), '01');
  assert.equal(stepTimePart('', 'minute', 1), '00');
  assert.equal(stepTimePart('99', 'hour', -1), '12');
  assert.equal(toClockTime({ hour: '01', minute: '00', period: '' }), '');
  assert.equal(toClockTime({ hour: '12', minute: '00', period: 'AM' }), '00:00');
});
