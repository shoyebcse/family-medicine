import { useEffect, useRef } from 'react';
import { useMedicine } from '../state/MedicineProvider';
import { StockEpisodes, isLowStock } from './rules';
import { clearStockNotifications, showStockNotification } from './notifications';

export function StockNotifier() {
  const { schedules, lastSync } = useMedicine();
  const episodes = useRef(new StockEpisodes());
  useEffect(() => {
    if (!lastSync) return;
    if (episodes.current.next(schedules).length)
      void showStockNotification().catch(() => {
        /* Persistent in-app warning remains available. */
      });
    if (!schedules.some(isLowStock)) void clearStockNotifications().catch(() => {});
  }, [schedules, lastSync]);
  useEffect(
    () => () => {
      void clearStockNotifications().catch(() => {});
    },
    [],
  );
  return null;
}
