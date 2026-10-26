import type { Schedule } from '../domain/types';

export function validateStockThreshold(
  threshold: number | undefined,
  stock?: number,
  quantity?: number,
) {
  if (threshold === undefined) return;
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    !/^\d{1,10}(\.\d{1,4})?$/.test(String(threshold))
  )
    throw new Error(
      'Enter a low-stock threshold of zero or more with at most four decimal places.',
    );
  if (stock === undefined || quantity === undefined)
    throw new Error('Low-stock alerts need tracked stock and a confirmed numeric dose quantity.');
}
export function isLowStock(
  schedule: Pick<Schedule, 'stock' | 'lowStockThreshold' | 'lowStock'>,
): boolean {
  if (schedule.stock === undefined || schedule.lowStockThreshold === undefined) return false;
  if (typeof schedule.lowStock === 'boolean') return schedule.lowStock;
  return Math.round(schedule.stock * 10000) <= Math.round(schedule.lowStockThreshold * 10000);
}
/** One alert per low-stock episode, per process. Refresh/retries do not repeat it. */
export class StockEpisodes {
  private alerted = new Set<string>();
  next(schedules: Schedule[]): Schedule[] {
    const active = new Set(schedules.filter(isLowStock).map((item) => item.id));
    for (const id of this.alerted) if (!active.has(id)) this.alerted.delete(id);
    return schedules.filter((item) => {
      if (!active.has(item.id) || this.alerted.has(item.id)) return false;
      this.alerted.add(item.id);
      return true;
    });
  }
}
