export const DEFAULT_ZONE = 'Asia/Kolkata';
export function localDate(date = new Date(), timezone = DEFAULT_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
export function timeLabel(value: string, zone = DEFAULT_ZONE): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
export function dateLabel(value = new Date()): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: DEFAULT_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(value);
}
export function isRecorded(status: string): boolean {
  return status === 'TAKEN' || status === 'SKIPPED';
}
export const statusLabel: Record<string, string> = {
  UPCOMING: 'Upcoming',
  DUE: 'Due now',
  NOT_RECORDED: 'Not recorded',
  TAKEN: 'Taken',
  SKIPPED: 'Skipped',
};
