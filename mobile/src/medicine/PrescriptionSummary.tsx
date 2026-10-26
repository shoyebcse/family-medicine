import type { Schedule } from '../domain/types';
import { Body } from '../components/ui';

export function PrescriptionSummary({
  schedule,
}: {
  schedule: Pick<Schedule, 'prescriptionDetails' | 'doseQuantity' | 'unit'>;
}) {
  const details = schedule.prescriptionDetails;
  if (!details) return null;
  const entered = (value?: string) =>
    !!value?.trim() && !/^not (entered|specified)$/i.test(value.trim());
  const formRoute = [
    entered(details.form) ? details.form : '',
    entered(details.route) ? details.route : '',
  ].filter(Boolean);
  const frequencyMeals = [
    entered(details.frequency) ? details.frequency : '',
    entered(details.mealInstruction) ? details.mealInstruction : '',
  ].filter(Boolean);
  return (
    <>
      {entered(details.genericName) ? (
        <Body>Generic/composition: {details.genericName}</Body>
      ) : null}
      {formRoute.length ? <Body>{formRoute.join(' · ')}</Body> : null}
      {!details.amountUnspecified && schedule.doseQuantity !== undefined ? (
        <Body>
          Amount each time: {schedule.doseQuantity} {schedule.unit}
        </Body>
      ) : null}
      {frequencyMeals.length ? <Body>{frequencyMeals.join(' · ')}</Body> : null}
    </>
  );
}
