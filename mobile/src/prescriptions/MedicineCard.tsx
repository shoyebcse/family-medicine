import { ErrorNotice } from '../components/ErrorNotice';
import { DoseUnitField } from '../components/DoseUnitField';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Body, Button, Field, Label, Panel, styles } from '../components/ui';
import { DateField } from '../components/DateField';
import { MedicineNameField } from '../components/MedicineNameField';
import { ReminderTimesField } from '../components/ReminderTimesField';
import { clockTimeLabel } from '../medicine/scheduleFields';
import { reminderFields, reviewedSchedule, extractedReviewFields } from './review';
import type { ExtractedMedicine, PrescriptionItem, Routine } from './types';
import { proposeTimes } from './rules';

function fieldsMessages(value?: string) {
  return value ? value.split('\n') : [];
}

export function MedicineCard({
  item,
  index,
  memberId,
  routine,
  active,
  onChange,
  onRemove,
}: {
  item: PrescriptionItem;
  index: number;
  memberId: string;
  routine: Routine;
  active?: string;
  onChange(item: PrescriptionItem): void;
  onRemove(): void;
}) {
  const [error, setError] = useState('');
  const messages = fieldsMessages(item.fields?.timingSource);
  const [details, setDetails] = useState(false);
  const fields = extractedReviewFields(item);
  const times = reminderFields(fields.times);
  const edit = (patch: Partial<PrescriptionItem>) => {
    setError('');
    onChange({ ...item, ...patch, verified: false, schedule: null });
  };
  const field = (key: string, value: string) =>
    edit({ fields: { ...fields, [key]: value, ...(key === 'times' ? { timingSource: '' } : {}) } });
  const evidence = (key: keyof ExtractedMedicine, value: string) =>
    edit({ evidence: { ...item.evidence, [key]: value || null } });
  const confirm = () => {
    try {
      const input = reviewedSchedule(item, memberId, routine);
      onChange({ ...item, schedule: input, verified: true });
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Check this medicine.');
    }
  };
  return (
    <Panel>
      <Label>
        Medicine {index + 1}
        {active ? ` · ${active}` : item.verified ? ' · Reviewed' : ' · Draft — needs review'}
      </Label>
      <Body>
        * Required to review and activate a schedule. Unresolved entries can still be saved as
        drafts.
      </Body>
      <Body>Original text: {item.evidence.raw || 'Unreadable / not supplied'}</Body>
      {item.evidence.unclear ? (
        <Body>
          Uncertain extraction: compare every field with the prescription and confirm with the
          prescriber/pharmacist where needed.
        </Body>
      ) : null}
      {active ? (
        <>
          <Body>
            {item.evidence.brand || 'Unnamed medicine'} ·{' '}
            {item.schedule?.times.map(clockTimeLabel).join(', ')}
          </Body>
          <Body>
            Saved instructions remain in history. An activated entry cannot be edited here.
          </Body>
        </>
      ) : (
        <>
          <MedicineNameField
            required
            label="Medicine name — confirm spelling"
            value={item.evidence.brand || ''}
            onChange={(text) => evidence('brand', text)}
          />
          <Field
            label="Product strength (if written)"
            value={item.evidence.strength || ''}
            onChangeText={(text) => evidence('strength', text)}
            maxLength={100}
          />
          <Field
            required
            label="Dose as written"
            value={item.evidence.dose || ''}
            onChangeText={(text) => evidence('dose', text)}
          />
          <Field
            required
            label="Frequency as written"
            value={item.evidence.frequency || ''}
            onChangeText={(text) => evidence('frequency', text)}
            maxLength={150}
          />
          <Body>
            Enter Once daily, Twice daily, Three times daily or Four times daily. OD, BD, TDS, QID
            and HS are also accepted. Daily alone does not specify the dose count; confirm it
            against the prescription.
          </Body>
          <Field
            required
            label="Duration as written"
            value={item.evidence.duration || ''}
            onChangeText={(text) => evidence('duration', text)}
          />
          <Button
            secondary
            compact
            title={details ? 'Hide extracted details' : 'Show pattern, timing and food details'}
            onPress={() => setDetails(!details)}
          />
          {details ? (
            <>
              <Field
                label="Pattern as written"
                value={item.evidence.pattern || ''}
                onChangeText={(text) => evidence('pattern', text)}
              />
              <Field
                label="Timing labels / exact times (comma separated)"
                value={item.evidence.timing.join(', ')}
                onChangeText={(text) =>
                  edit({
                    evidence: { ...item.evidence, timing: text.split(',').map((t) => t.trim()) },
                  })
                }
              />
              <Field
                label="Food instructions"
                value={item.evidence.food || ''}
                onChangeText={(text) => evidence('food', text)}
                maxLength={150}
              />
              <View style={styles.between}>
                <Body>As needed / SOS</Body>
                <Switch
                  accessibilityLabel="As-needed medicine"
                  value={item.evidence.sos}
                  onValueChange={(sos) => edit({ evidence: { ...item.evidence, sos } })}
                />
              </View>
            </>
          ) : null}
          <Field
            required
            label="Confirmed full prescription instructions"
            value={fields.instruction || ''}
            onChangeText={(text) => field('instruction', text)}
            multiline
            maxLength={300}
          />
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 100 }}>
              <Field
                required
                label="Amount each dose"
                value={fields.quantity || ''}
                onChangeText={(text) => field('quantity', text)}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, minWidth: 100 }}>
              <DoseUnitField value={fields.unit || ''} onChange={(unit) => field('unit', unit)} />
            </View>
          </View>
          <Body>
            This screen supports fixed daily doses only. Irregular, tapering or variable-dose
            courses need manual review and a supported plan.
          </Body>
          <Button
            secondary
            title="Propose times from reviewed timing labels"
            onPress={() => {
              try {
                const result = proposeTimes(item.evidence, routine);
                edit({
                  fields: {
                    ...fields,
                    timingSource: result.messages.join('\n'),
                    times: JSON.stringify(
                      result.times.map((time) => {
                        const [hour, minute] = time.split(':');
                        return {
                          hour: String(Number(hour) % 12 || 12),
                          minute,
                          period: Number(hour) < 12 ? 'AM' : 'PM',
                        };
                      }),
                    ),
                  },
                });
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : 'Enter confirmed times manually.',
                );
              }
            }}
          />
          {messages.map((message, index) => (
            <Body key={index}>{message}</Body>
          ))}
          <Body>
            Timezone: {routine.timezone}. Repeats every day; confirm that this matches the
            prescription.
          </Body>
          <ReminderTimesField
            value={times}
            onChange={(value) => field('times', JSON.stringify(value))}
          />
          <DateField
            required
            label="Confirmed treatment start"
            value={fields.start || ''}
            onChange={(value) => field('start', value)}
          />
          <View style={styles.between}>
            <Body>No prescribed end date</Body>
            <Switch
              accessibilityLabel="No prescribed end date for this medicine"
              value={fields.noEnd === 'true'}
              onValueChange={(value) => field('noEnd', String(value))}
            />
          </View>
          {fields.noEnd !== 'true' ? (
            <DateField
              required
              label="Last treatment date (included)"
              value={fields.end || ''}
              onChange={(value) => field('end', value)}
            />
          ) : null}
          <Field
            required={item.evidence.unclear}
            label="How unclear instructions were confirmed (if needed)"
            value={item.reviewNote || ''}
            onChangeText={(reviewNote) => edit({ reviewNote })}
            maxLength={200}
          />
          <Body>
            Review identity, strength, dose, frequency, food instructions, duration, timezone and
            every time against the original before confirming.
          </Body>
          <Button
            secondary
            title={
              item.verified ? 'Clear this medicine review' : 'I reviewed and confirm this medicine'
            }
            onPress={() => (item.verified ? edit({}) : confirm())}
          />
          <Button secondary compact title="Remove this medicine" onPress={onRemove} />
        </>
      )}
      <ErrorNotice message={error} />
    </Panel>
  );
}
