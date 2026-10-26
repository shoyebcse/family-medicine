import { View } from 'react-native';
import type { ReminderTime } from '../medicine/scheduleFields';
import { Button, Label } from './ui';
import { DigitalTimePicker } from './DigitalTimePicker';

export function ReminderTimesField({
  value,
  onChange,
  maxTimes = 12,
  required = true,
}: {
  value: ReminderTime[];
  onChange(value: ReminderTime[]): void;
  maxTimes?: number;
  required?: boolean;
}) {
  const update = (index: number, patch: Partial<ReminderTime>) =>
    onChange(value.map((time, current) => (current === index ? { ...time, ...patch } : time)));
  return (
    <View style={{ gap: 12 }}>
      <Label required={required}>Reminder times</Label>

      {value.map((time, index) => (
        <View key={index} style={{ gap: 8 }}>
          <DigitalTimePicker
            label={`Time ${index + 1}`}
            value={time}
            required={required}
            onChange={(value) => update(index, value)}
          />
          {value.length > 1 ? (
            <Button
              secondary
              compact
              title={`Remove time ${index + 1}`}
              onPress={() => onChange(value.filter((_, current) => current !== index))}
            />
          ) : null}
        </View>
      ))}
      {value.length < maxTimes ? (
        <Button
          secondary
          compact
          title="Add another reminder time"
          onPress={() => onChange([...value, { hour: '', minute: '', period: '' }])}
        />
      ) : null}
    </View>
  );
}
