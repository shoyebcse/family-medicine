import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { isRecorded, statusLabel, timeLabel } from '../domain/dates';
import type { DoseAction, Occurrence } from '../domain/types';
import { useMedicine } from '../state/MedicineProvider';
import { Body, Button, colors, Label, Panel, styles } from './ui';
import { PrescriptionSummary } from '../medicine/PrescriptionSummary';

export function DoseCard({ dose, readonly }: { dose: Occurrence; readonly?: boolean }) {
  const { record, busy, schedules } = useMedicine();
  const schedule = schedules.find((item) => item.id === dose.scheduleId);
  const [confirm, setConfirm] = useState<DoseAction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const done = isRecorded(dose.status);
  const early = dose.status === 'UPCOMING';
  return (
    <Panel>
      {dose.sampleData ? (
        <Text style={{ color: colors.amber, fontSize: 12 }}>Test data</Text>
      ) : null}
      <View style={styles.between}>
        <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '700' }}>
          {timeLabel(dose.dueAt, dose.timezone)}
        </Text>
        <Text
          style={{
            color: dose.status === 'TAKEN' ? colors.teal : colors.muted,
            fontSize: 12,
            fontWeight: '600',
            backgroundColor: colors.paper,
            padding: 7,
            borderRadius: 7,
          }}
        >
          {statusLabel[dose.status]}
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <Label>{dose.medicineName}</Label>
        <Body>{[dose.strength, dose.memberName].filter(Boolean).join(' · ')}</Body>
      </View>
      {schedule?.doseQuantity !== undefined && !schedule.prescriptionDetails?.amountUnspecified ? (
        <Text style={{ color: colors.ink, fontSize: 15 }}>
          {schedule.doseQuantity} {schedule.unit}
        </Text>
      ) : null}
      {dose.actualAt && <Body>Recorded taken at {timeLabel(dose.actualAt, dose.timezone)}</Body>}
      <Button
        secondary
        compact
        title={detailsOpen ? 'Hide details' : 'Details'}
        onPress={() => setDetailsOpen(!detailsOpen)}
      />
      {detailsOpen ? (
        <View style={{ gap: 8 }}>
          {dose.doseInstruction && dose.doseInstruction !== dose.medicineName ? (
            <Body>{dose.doseInstruction}</Body>
          ) : null}
          {schedule ? <PrescriptionSummary schedule={schedule} /> : null}
          {schedule?.doseQuantity === undefined ? (
            <Body>Dose amount not entered. Refer to the prescription.</Body>
          ) : null}
          {dose.stock !== undefined && (
            <Body>
              {dose.stock < 0
                ? 'Stock estimate needs review'
                : `Estimated stock: ${dose.stock} ${dose.unit}`}
            </Body>
          )}
        </View>
      ) : null}
      {!readonly && !done && (
        <View style={styles.row}>
          <View style={{ flex: 1, minWidth: 130 }}>
            <Button title="Mark taken" disabled={busy} onPress={() => setConfirm('TAKEN')} />
          </View>
          <Button title="Skip" secondary disabled={busy} onPress={() => setConfirm('SKIPPED')} />
        </View>
      )}
      <Modal
        transparent
        visible={confirm !== null}
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View style={local.backdrop}>
          <View style={local.dialog}>
            <Label>
              {confirm === 'TAKEN'
                ? early
                  ? 'Record this dose early?'
                  : 'Record this dose as taken?'
                : 'Record this dose as skipped?'}
            </Label>
            <Body>
              {dose.memberName} · {dose.medicineName} · {timeLabel(dose.dueAt, dose.timezone)}
            </Body>
            <Body>
              {confirm === 'TAKEN'
                ? 'Confirm only if this dose has actually been taken. This records your action and does not recommend when to take a dose.'
                : 'Skipped is an explicit record. Leaving a dose unrecorded does not mark it skipped.'}
            </Body>
            <Button
              title={confirm === 'TAKEN' ? 'Confirm taken' : 'Confirm skipped'}
              disabled={busy}
              onPress={() => {
                if (confirm) void record(dose, confirm, early);
                setConfirm(null);
              }}
            />
            <Button title="Go back" secondary onPress={() => setConfirm(null)} />
          </View>
        </View>
      </Modal>
    </Panel>
  );
}
const local = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#16382F88',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 24,
    gap: 18,
  },
});
