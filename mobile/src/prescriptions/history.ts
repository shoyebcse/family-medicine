import type { Prescription } from './types';
export type HistoryFilter = 'All' | 'Review needed' | 'With schedules';
export function filterHistory(history: Prescription[], filter: HistoryFilter): Prescription[] {
  return history
    .filter(
      (item) =>
        filter === 'All' ||
        (filter === 'Review needed'
          ? item.items.some((entry) => !item.plans[entry.id])
          : Object.keys(item.plans).length > 0),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
export function historyStatus(item: Prescription): string {
  const linked = Object.keys(item.plans).length;
  return linked === 0
    ? 'Review needed'
    : item.items.some((entry) => !item.plans[entry.id])
      ? 'Partly scheduled'
      : 'Schedules created';
}
