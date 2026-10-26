import { useEffect, useState } from 'react';
import type { Schedule } from '../domain/types';
import { Body, Button, Field } from '../components/ui';
import { useMedicine } from '../state/MedicineProvider';
import { isLowStock, validateStockThreshold } from './rules';

export function StockAlertEditor({ schedule }: { schedule: Schedule }) {
  const { repository, refresh } = useMedicine();
  const [value, setValue] = useState(schedule.lowStockThreshold?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setValue(schedule.lowStockThreshold?.toString() ?? ''), 0);
    return () => clearTimeout(timer);
  }, [schedule.lowStockThreshold]);
  if (schedule.stock === undefined) return null;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (value.trim() && !/^\d{1,10}(\.\d{1,4})?$/.test(value.trim()))
        throw new Error('Enter zero or more, with at most four decimal places.');
      const threshold = value.trim() ? Number(value) : undefined;
      validateStockThreshold(threshold, schedule.stock, schedule.doseQuantity);
      await repository.updateStockAlert(schedule.id, threshold);
      await refresh();
      setMessage(
        threshold === undefined ? 'Low-stock alert turned off.' : 'Low-stock threshold saved.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the alert. Retry.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {isLowStock(schedule) ? (
        <Body>
          Low stock: estimated {schedule.stock} {schedule.unit} remaining. Check your supply. A
          negative estimate needs review.
        </Body>
      ) : null}
      <Field
        label={`Low-stock alert (${schedule.unit})`}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        editable={!busy}
        placeholder="Leave blank to turn off"
        hint="Alerts at this amount or below. This does not change your prescribed dose or duration."
      />
      <Button
        title={busy ? 'Saving…' : 'Save stock alert'}
        secondary
        compact
        disabled={busy}
        onPress={() => void save()}
      />
      {message ? <Body>{message}</Body> : null}
    </>
  );
}
