import { ErrorNotice } from '../components/ErrorNotice';
import { useState } from 'react';
import { Body, Button, Field, Label, Panel } from '../components/ui';
import { ReminderTimesField } from '../components/ReminderTimesField';
import { toClockTime, clockTimeLabel, type ReminderTime } from '../medicine/scheduleFields';
import { DEFAULT_ROUTINE } from './rules';
import type { Routine } from './types';

export function RoutineEditor({
  value,
  onChange,
  onSave,
  busy,
}: {
  value: Routine;
  onChange(value: Routine): void;
  onSave(): void;
  busy: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, ReminderTime[]>>({});
  const [error, setError] = useState('');
  return (
    <Panel>
      <Label>Daily routine for this family member</Label>
      <Body>
        These are suggestions for reviewed instructions. Saving a routine never changes an active
        medicine schedule. Review affected plans separately.
      </Body>
      {Object.entries(DEFAULT_ROUTINE).map(([name, fallback]) => {
        const key = name as keyof typeof DEFAULT_ROUTINE;
        const clock = value[key];
        const [hour, minute] = (clock || ':').split(':');
        return (
          <Panel key={key}>
            <Label>{key === 'wakeUp' ? 'Wake up' : key[0].toUpperCase() + key.slice(1)}</Label>
            <Body>
              {clock
                ? `Patient time: ${clockTimeLabel(clock)}`
                : `Using default ${key === 'wakeUp' ? 'wake-up' : key} time: ${clockTimeLabel(fallback)} when a reviewed instruction needs this activity.`}
            </Body>
            <ReminderTimesField
              maxTimes={1}
              required={false}
              value={
                drafts[key] || [
                  {
                    hour: clock ? String(Number(hour) % 12 || 12) : '',
                    minute: minute || '',
                    period: clock ? (Number(hour) < 12 ? 'AM' : 'PM') : '',
                  },
                ]
              }
              onChange={(times) => {
                // Keep incomplete input locally; do not turn it into a default time.
                setDrafts({ ...drafts, [key]: times });
                setError('');
                const time = times[0];
                onChange({ ...value, [key]: toClockTime(time) || null });
              }}
            />
            <Button
              secondary
              compact
              title={`Use default ${key} instead`}
              onPress={() => {
                setDrafts((old) => {
                  const next = { ...old };
                  delete next[key];
                  return next;
                });
                onChange({ ...value, [key]: null });
              }}
            />
          </Panel>
        );
      })}
      <Field
        label="Routine timezone"
        required
        value={value.timezone}
        onChangeText={(timezone) => onChange({ ...value, timezone })}
      />
      <ErrorNotice message={error} />
      <Button
        title="Save patient routine"
        disabled={busy}
        onPress={() => {
          if (Object.values(drafts).some((times) => !toClockTime(times[0]))) {
            setError('Complete each edited time or choose Use default.');
            return;
          }
          onSave();
        }}
      />
    </Panel>
  );
}
