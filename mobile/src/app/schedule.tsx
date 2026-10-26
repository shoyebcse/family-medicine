import { useRef, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Switch, Text, View } from 'react-native';
import {
  Body,
  Button,
  Chip,
  colors,
  Field,
  Heading,
  Label,
  Loading,
  Panel,
  Screen,
  styles,
} from '../components/ui';
import { addDays, DEFAULT_ZONE, localDate, timeLabel } from '../domain/dates';
import type { ScheduleInput, SchedulePreview } from '../domain/types';
import { useMedicine } from '../state/MedicineProvider';
import { DateField } from '../components/DateField';
import { MedicineNameField } from '../components/MedicineNameField';
import { ErrorNotice } from '../components/ErrorNotice';
import { ReminderTimesField } from '../components/ReminderTimesField';
import { toClockTime, clockTimeLabel, type ReminderTime } from '../medicine/scheduleFields';
import { SelectField } from '../components/SelectField';
import { DoseUnitField } from '../components/DoseUnitField';
import { validatePrescription } from '../medicine/prescription';
import { PrescriptionSummary } from '../medicine/PrescriptionSummary';
import { validateStockThreshold } from '../stock/rules';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export default function ScheduleScreen() {
  const { members, loading, lastSync, refresh } = useMedicine();
  if (loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!lastSync)
    return (
      <Screen>
        <Heading
          title="Load your family first"
          subtitle="Connect successfully before adding a medicine."
        />
        <Button title="Retry connection" onPress={() => void refresh()} />
        <Button secondary title="Open Family" onPress={() => router.replace('/family')} />
      </Screen>
    );
  if (!members.length) return <Redirect href={{ pathname: '/family', params: { add: '1' } }} />;
  return <MedicineScheduleForm />;
}
function MedicineScheduleForm() {
  const { members, repository, refresh, demo } = useMedicine();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const [member, setMember] = useState(params.memberId ?? members[0]?.id ?? '');
  const [name, setName] = useState('');
  const [regimen, setRegimen] = useState('Fixed amount at each scheduled time');
  const [amountUnspecified, setAmountUnspecified] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [stock, setStock] = useState('');
  const [stockThreshold, setStockThreshold] = useState('');
  const [times, setTimes] = useState<ReminderTime[]>([{ hour: '', minute: '', period: '' }]);
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6, 7]);
  const [start, setStart] = useState(() => localDate());
  const [end, setEnd] = useState(() => localDate());
  const [noEnd, setNoEnd] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [savedInput, setSavedInput] = useState<ScheduleInput | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const selectedMember = members.find((item) => item.id === member);
  const commandKey = useRef(Crypto.randomUUID());
  const lock = useRef(false);
  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setReviewed(false);
      setter(value);
    };
  }
  async function review() {
    if (lock.current) return;
    setError('');
    if (!selectedMember) {
      setError(
        members.length
          ? 'Choose a current family member above. This page may still point to an old sample profile.'
          : 'No family members are loaded. Add a member in Family or retry the connection first.',
      );
      return;
    }
    if (regimen !== 'Fixed amount at each scheduled time') {
      setError(
        'Choose a fixed schedule. As-needed, tapering and changing amounts need a dedicated plan and are not supported here yet.',
      );
      return;
    }
    const clockTimes = times.map(toClockTime);
    if (!member || !name.trim()) {
      setError('Choose a member and enter the medicine line.');
      return;
    }
    if (!validDate(start) || (!noEnd && (!validDate(end) || end < start))) {
      setError(
        'Choose a start date and an end date on or after the start, or confirm no end date.',
      );
      return;
    }
    if (start > addDays(localDate(), 365)) {
      setError('Choose a start date within the next year for this preview.');
      return;
    }
    if (
      !clockTimes.length ||
      clockTimes.length > 12 ||
      clockTimes.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) ||
      new Set(clockTimes).size !== clockTimes.length
    ) {
      setError('Enter 1 to 12 different times: hour 1–12, minute 00–59, and AM or PM for each.');
      return;
    }
    if (!days.length) {
      setError('Choose at least one weekday.');
      return;
    }
    if (!reviewed) {
      setError('Review and confirm the prescribed instructions before continuing.');
      return;
    }
    const numberPattern = /^\d{1,10}(\.\d{1,4})?$/;
    if (
      (quantity && (!numberPattern.test(quantity) || Number(quantity) <= 0)) ||
      (stock && !numberPattern.test(stock))
    ) {
      setError(
        'Amount each time must contain only a number: enter 1, with tablet in the unit field. Decimals such as 0.5 are allowed. Stock also uses numbers only.',
      );
      return;
    }
    if ((quantity || stock) && !unit.trim()) {
      setError('Choose a dose unit in Details when entering an amount or tracking stock.');
      setShowDetails(true);
      return;
    }
    if (stock && !quantity) {
      setError('Enter a dose quantity in the same unit before enabling stock tracking.');
      return;
    }
    const input: ScheduleInput = {
      memberId: member,
      medicineName: name.trim(),
      strength: '',
      doseInstruction: instruction.trim() || name.trim(),
      unit: unit.trim() || 'Not entered',
      ...(!amountUnspecified && quantity ? { doseQuantity: Number(quantity) } : {}),
      ...(stock ? { initialStock: Number(stock) } : {}),
      ...(stockThreshold.trim() ? { lowStockThreshold: Number(stockThreshold) } : {}),
      times: clockTimes.sort(),
      weekdays: [...days].sort(),
      timezone: DEFAULT_ZONE,
      startDate: start,
      ...(noEnd ? {} : { endDate: end }),
      noEndAcknowledged: noEnd,
      reviewed,
      prescriptionDetails: {
        form: 'Not entered',
        route: 'Not entered',
        frequency: 'Not entered',
        mealInstruction: 'Not entered',
        amountUnspecified: amountUnspecified || !quantity.trim(),
        regimenType: 'FIXED',
      },
    };
    try {
      validatePrescription(input);
      if (stockThreshold.trim() && !numberPattern.test(stockThreshold.trim()))
        throw new Error('Enter a threshold of zero or more with at most four decimal places.');
      validateStockThreshold(input.lowStockThreshold, input.initialStock, input.doseQuantity);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review the medicine details.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await repository.preview(input);
      if (!result.occurrences.length)
        throw new Error('There are no upcoming doses in these dates. Review the dates and times.');
      setSavedInput(input);
      setPreview(result);
      commandKey.current = Crypto.randomUUID();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not preview schedule. Please retry.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function activate() {
    if (!savedInput || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await repository.activate(savedInput, commandKey.current);
      await refresh();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save schedule. Please retry.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Button title="Back to your plan" secondary compact onPress={() => router.replace('/')} />
      <Heading
        title={preview ? 'Review your medicine plan.' : 'Add a medicine.'}
        subtitle="Enter the medicine as prescribed and choose reminder times."
      />
      {error && preview ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 22 }}>
          {error}
        </Text>
      ) : null}
      {preview && savedInput ? (
        <>
          <Panel tinted>
            <Label>{savedInput.medicineName}</Label>
            <Body>
              {members.find((m) => m.id === savedInput.memberId)?.name} ·{' '}
              {savedInput.strength || 'Strength not entered'}
            </Body>
            <Body>{savedInput.doseInstruction}</Body>
            <PrescriptionSummary schedule={savedInput} />
            {savedInput.lowStockThreshold !== undefined ? (
              <Body>
                Low-stock alert at {savedInput.lowStockThreshold} {savedInput.unit} or below.
              </Body>
            ) : null}
            <Body>
              {savedInput.times.map(clockTimeLabel).join(', ')} · {savedInput.timezone}
            </Body>
            <Body>
              {savedInput.startDate} to {savedInput.endDate ?? 'No end date acknowledged'}
            </Body>
            {savedInput.initialStock !== undefined && (
              <Body>
                Stock: {savedInput.initialStock} {savedInput.unit} · Dose quantity:{' '}
                {savedInput.doseQuantity} {savedInput.unit}
              </Body>
            )}
          </Panel>
          <Label>Next planned doses</Label>
          <Panel>
            {preview.occurrences.slice(0, 6).map((o) => (
              <View key={o.id} style={styles.between}>
                <Body>{o.localDate}</Body>
                <Text style={{ fontWeight: '600', color: colors.ink }}>
                  {timeLabel(o.dueAt, preview.timezone)}
                </Text>
              </View>
            ))}
          </Panel>
          <Body>
            {preview.occurrences.length} doses in this preview. {preview.coverageNote}
          </Body>
          <Button
            title={busy ? 'Saving…' : demo ? 'Save sample medicine' : 'Save medicine and schedule'}
            disabled={busy}
            onPress={() => void activate()}
          />
          <Button
            secondary
            title="Edit details"
            disabled={busy}
            onPress={() => {
              setPreview(null);
              setSavedInput(null);
            }}
          />
        </>
      ) : (
        <>
          <Label required>Who is this medicine for?</Label>
          <View style={styles.row}>
            {members.map((m) => (
              <Chip
                key={m.id}
                title={m.name}
                active={member === m.id}
                onPress={() => {
                  setReviewed(false);
                  setMember(m.id);
                }}
              />
            ))}
          </View>
          {!members.length && <Body>Add a member in Family before creating a schedule.</Body>}
          <Panel>
            <MedicineNameField
              required
              label="Medicine name, dose and frequency"
              value={name}
              onChange={change(setName)}
            />
          </Panel>
          <Button
            secondary
            compact
            title={showDetails ? 'Hide details' : 'Details (optional)'}
            onPress={() => setShowDetails(!showDetails)}
          />
          {showDetails ? (
            <Panel>
              <Field
                label="Original confirmed prescription instructions"
                value={instruction}
                onChangeText={change(setInstruction)}
                maxLength={300}
                multiline
                placeholder="Copy the full instructions, including special directions"
              />
              <SelectField
                label="Type of medicine plan"
                value={regimen}
                onChange={change(setRegimen)}
                options={[
                  'Fixed amount at each scheduled time',
                  'As needed',
                  'Changing amount / tapering course',
                ]}
              />
              {regimen && regimen !== 'Fixed amount at each scheduled time' ? (
                <Body>
                  This form currently supports a fixed amount repeated at confirmed times. As-needed
                  or changing-dose treatment needs a separate plan; do not turn it into a fixed
                  daily schedule.
                </Body>
              ) : null}
              <DoseUnitField
                required={!!quantity || !!stock}
                value={unit}
                onChange={change(setUnit)}
              />
              <Field
                label="Amount each time"
                value={quantity}
                onChangeText={change(setQuantity)}
                keyboardType="decimal-pad"
                placeholder="1"
                editable={!amountUnspecified}
                hint="Numbers only: enter 1 here and tablet in the unit field. Use 0.5 for half a tablet if prescribed."
              />
              <View style={styles.row}>
                <Switch
                  accessibilityLabel="The prescription does not specify a numeric amount"
                  value={amountUnspecified}
                  onValueChange={(value) => {
                    setReviewed(false);
                    setAmountUnspecified(value);
                    if (value) {
                      setQuantity('');
                      setStock('');
                      setStockThreshold('');
                    }
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Body>
                    Amount not specified. Keep the original instructions; confirm unclear doses
                    before use. Stock tracking stays off.
                  </Body>
                </View>
              </View>
            </Panel>
          ) : null}
          <Panel>
            <Label>Schedule</Label>
            <ReminderTimesField value={times} onChange={change(setTimes)} />
            <Body>Timezone: Asia/Kolkata</Body>
            <Body>
              Repeat:{' '}
              {days.length === 7
                ? 'Every day'
                : days.map((day) => DAYS[day - 1]).join(', ') || 'No days selected'}
              . Review against the prescription.
            </Body>
            <Button
              secondary
              compact
              title={showDays ? 'Hide weekdays' : 'Change weekdays'}
              onPress={() => setShowDays(!showDays)}
            />
            {showDays ? (
              <View style={styles.row}>
                {DAYS.map((day, index) => (
                  <Chip
                    key={day}
                    title={day}
                    active={days.includes(index + 1)}
                    onPress={() => {
                      setReviewed(false);
                      setDays(
                        days.includes(index + 1)
                          ? days.filter((d) => d !== index + 1)
                          : [...days, index + 1],
                      );
                    }}
                  />
                ))}
              </View>
            ) : null}
            <DateField
              required
              label="Confirmed start date"
              value={start}
              onChange={change(setStart)}
            />
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Body>No end date specified</Body>
              </View>
              <Switch
                accessibilityLabel="I acknowledge no prescribed end date is specified"
                value={noEnd}
                onValueChange={change(setNoEnd)}
                trackColor={{ true: colors.teal }}
              />
            </View>
            {noEnd ? (
              <Body>
                You acknowledge that no duration is specified. Stock quantity does not determine
                treatment duration.
              </Body>
            ) : (
              <DateField
                required
                label="Last treatment date (included)"
                value={end}
                onChange={change(setEnd)}
              />
            )}
          </Panel>
          <Button
            secondary
            title={showStock ? 'Hide stock tracking' : 'Add stock tracking (optional)'}
            onPress={() => setShowStock(!showStock)}
          />
          {showStock ? (
            <Panel>
              <Field
                label="Initial stock optional"
                value={stock}
                onChangeText={change(setStock)}
                keyboardType="decimal-pad"
                placeholder="Leave blank to disable stock tracking"
                editable={!amountUnspecified}
                hint={`Stock and dose quantity must both use ${unit || 'the same unit'}. No automatic conversions.`}
              />
              <Field
                label="Low-stock alert at (optional)"
                value={stockThreshold}
                onChangeText={change(setStockThreshold)}
                keyboardType="decimal-pad"
                editable={!amountUnspecified}
                placeholder="For example, 5"
                hint={`Alert when estimated stock reaches this amount or below, in ${unit || 'the same unit as stock'}. Leave blank to turn off. Zero alerts only when stock is depleted.`}
              />
              <Body>
                Alerts are checked when the app loads confirmed stock or records a dose. No SMS is
                sent. The app does not predict stock while closed.
              </Body>
            </Panel>
          ) : null}
          <View style={styles.row}>
            <Switch
              accessibilityLabel="I have reviewed and confirmed the prescribed instructions and times"
              value={reviewed}
              onValueChange={setReviewed}
              trackColor={{ true: colors.teal }}
            />
            <View style={{ flex: 1 }}>
              <Body>
                I confirm this fixed reminder plan, medicine instructions, times and treatment
                dates.
              </Body>
            </View>
          </View>
          <Body>Medicine for: {selectedMember?.name ?? 'Choose a member above'}</Body>
          <ErrorNotice message={error} />
          <Button
            title={busy ? 'Building preview…' : 'Preview schedule'}
            disabled={busy}
            onPress={() => void review()}
          />
        </>
      )}
    </Screen>
  );
}
