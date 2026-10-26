export type ReminderTime = { hour: string; minute: string; period: string };

/** Each column wraps independently; stepping never chooses or changes AM/PM. */
export function stepTimePart(value: string, part: 'hour' | 'minute', direction: 1 | -1): string {
  const min = part === 'hour' ? 1 : 0;
  const max = part === 'hour' ? 12 : 59;
  const current = Number(value);
  if (!/^\d{1,2}$/.test(value) || current < min || current > max)
    return String(direction === 1 ? min : max).padStart(2, '0');
  return String(min + ((current - min + direction + (max - min + 1)) % (max - min + 1))).padStart(
    2,
    '0',
  );
}

export function toClockTime(time: ReminderTime): string {
  if (
    !/^(0?[1-9]|1[0-2])$/.test(time.hour) ||
    !/^[0-5]\d$/.test(time.minute) ||
    !['AM', 'PM'].includes(time.period)
  )
    return '';
  const hour = (Number(time.hour) % 12) + (time.period === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${time.minute}`;
}

export function clockTimeLabel(time: string): string {
  const [hour, minute] = time.split(':');
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? 'AM' : 'PM'}`;
}

export function calendarMonth(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array<null>((first.getUTCDay() + 6) % 7).fill(null),
    ...Array.from(
      { length: count },
      (_, index) =>
        `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    ),
  ];
}
