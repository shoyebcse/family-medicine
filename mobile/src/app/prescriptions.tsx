import { ErrorNotice } from '../components/ErrorNotice';
import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Image, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Body, Button, Chip, Heading, Label, Panel, Screen, styles } from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import { useMedicine } from '../state/MedicineProvider';
import { PrescriptionApi, PrescriptionHttpError } from '../prescriptions/api';
import { PrescriptionHistory } from '../prescriptions/PrescriptionHistory';
import { MedicineCard } from '../prescriptions/MedicineCard';
import { UploadPanel } from '../prescriptions/UploadPanel';
import { RoutineEditor } from '../prescriptions/RoutineEditor';
import { EMPTY_MEDICINE } from '../prescriptions/rules';
import { reviewedCandidates, requireReviewedCandidates } from '../prescriptions/preview';
import type { Prescription, PrescriptionItem, Routine } from '../prescriptions/types';
import type { SchedulePreview } from '../domain/types';
import { timeLabel } from '../domain/dates';

export default function PrescriptionsScreen() {
  const auth = useAuth();
  const store = useMedicine();
  const api = useMemo(
    () => new PrescriptionApi(auth.apiUrl, auth.session?.token || '', auth.invalidate),
    [auth.apiUrl, auth.session?.token, auth.invalidate],
  );
  const [member, setMember] = useState('');
  const [history, setHistory] = useState<Prescription[]>([]);
  const [document, setDocument] = useState<Prescription | null>(null);
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [routine, setRoutine] = useState<Routine>({ timezone: 'Asia/Kolkata' });
  const [routineOpen, setRoutineOpen] = useState(false);
  const [states, setStates] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, SchedulePreview> | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (member && !store.demo) {
      Promise.all([api.history(member), api.routine(member)])
        .then(([history, routine]) => {
          if (!cancelled) {
            setHistory(history);
            setRoutine(routine);
          }
        })
        .catch((error) => {
          if (!cancelled) setError(error.message);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [member, api, store.demo]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (
        error instanceof PrescriptionHttpError &&
        (error.status === 403 || error.status === 404)
      ) {
        setDocument(null);
        setItems([]);
        setSources([]);
        setPreview(null);
        setHistory([]);
        setStates({});
        setMember('');
        setRoutine({ timezone: 'Asia/Kolkata' });
      }
      setError(
        error instanceof Error
          ? error.message
          : 'Could not finish this action. Your edits remain on screen.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const open = async (value: Prescription) => {
    setDocument(value);
    setItems(value.items);
    setPreview(null);
    setSources([]);
    setStates(await api.states(value.id));
  };
  const save = async () => {
    if (!document) throw new Error('Choose a prescription.');
    const saved = await api.save(document, items);
    setDocument(saved);
    setItems(saved.items);
    return saved;
  };
  const changed = (value: PrescriptionItem[]) => {
    setItems(value);
    setPreview(null);
    setNotice('Unsaved changes. Save the draft or preview before leaving this page.');
  };
  return (
    <Screen>
      <Button
        secondary
        title="Back to your plan"
        disabled={busy || uploading}
        onPress={() => router.replace('/')}
      />
      <Heading title="Add a prescription" />
      {store.demo ? (
        <Panel>
          <Body>
            Prescription upload needs a signed-in account and a connected backend. Sample-data mode
            does not send prescriptions to OpenAI.
          </Body>
          <Button title="Add one medicine manually" onPress={() => router.push('/schedule')} />
        </Panel>
      ) : (
        <>
          <Label required>Who is this prescription for?</Label>
          <Body>The detected patient name never chooses a family member automatically.</Body>
          <View style={styles.row}>
            {store.members.map((person) => (
              <Chip
                key={person.id}
                title={person.name}
                active={member === person.id}
                onPress={() => {
                  if (!busy && !uploading) {
                    setMember(person.id);
                    setDocument(null);
                    setItems([]);
                    setPreview(null);
                    setSources([]);
                    setHistory([]);
                    setRoutine({ timezone: 'Asia/Kolkata' });
                    setError('');
                    setNotice('');
                  }
                }}
              />
            ))}
          </View>
          {!store.members.length ? (
            <Button
              title="Add a family member first"
              onPress={() => router.push({ pathname: '/family', params: { add: '1' } })}
            />
          ) : null}
          {member ? (
            <View pointerEvents={busy ? 'none' : 'auto'} style={{ gap: 16 }}>
              <Button
                secondary
                title={routineOpen ? 'Hide daily routine' : 'Daily routine settings'}
                onPress={() => setRoutineOpen(!routineOpen)}
              />
              {routineOpen ? (
                <RoutineEditor
                  key={`routine:${member}`}
                  value={routine}
                  onChange={(value) => {
                    setRoutine(value);
                    setPreview(null);
                    setItems((current) =>
                      current.map((item) =>
                        document?.plans[item.id]
                          ? item
                          : { ...item, verified: false, schedule: null },
                      ),
                    );
                  }}
                  busy={busy}
                  onSave={() =>
                    void run(async () => {
                      setRoutine(await api.saveRoutine(member, routine));
                      setNotice(
                        'Routine saved. Active schedules are unchanged; review affected plans separately.',
                      );
                    })
                  }
                />
              ) : null}
              {!document ? (
                <UploadPanel
                  key={`upload:${member}`}
                  api={api}
                  memberId={member}
                  onBusy={setUploading}
                  onExtract={(value) =>
                    void run(async () => {
                      await open(value);
                      setHistory(await api.history(member));
                    })
                  }
                />
              ) : null}
              {document ? (
                <>
                  <Panel>
                    <Label>Prescription · version {document.version}</Label>
                    {document.extractionMode === 'mock' ? (
                      <Body>
                        Development fixture: fixed test response, unrelated to the uploaded
                        document. Review checks still apply; this is not a real extraction.
                      </Body>
                    ) : null}
                    <Body>
                      For {store.members.find((person) => person.id === member)?.name}. Written
                      patient: {document.extraction.patient.name || 'Not readable'}. Doctor:{' '}
                      {document.extraction.doctor.name || 'Not readable'}. Date:{' '}
                      {document.extraction.date || 'Not readable'}.
                    </Body>
                    <Body>
                      {items.length} medicine entries · {Object.keys(document.plans).length} linked
                      plans. Extraction never activates alarms.
                    </Body>
                    <Button
                      secondary
                      title="View original prescription pages"
                      onPress={() =>
                        void run(async () => {
                          setSources(
                            await api.request<string[]>(
                              `/prescriptions/${document.id}/original-pages`,
                            ),
                          );
                        })
                      }
                    />
                    {sources.map((uri, index) => (
                      <Image
                        key={index}
                        accessibilityLabel={`Original prescription page ${index + 1}`}
                        source={{ uri }}
                        style={{ width: '100%', height: 400 }}
                        resizeMode="contain"
                      />
                    ))}
                  </Panel>
                  {items.map((item, index) => (
                    <View key={item.id} style={{ gap: 8 }}>
                      <MedicineCard
                        item={item}
                        index={index}
                        memberId={member}
                        routine={routine}
                        active={states[item.id] || (document.plans[item.id] ? 'ACTIVE' : undefined)}
                        onChange={(value) =>
                          changed(items.map((old) => (old.id === item.id ? value : old)))
                        }
                        onRemove={() => changed(items.filter((old) => old.id !== item.id))}
                      />
                      {document.plans[item.id] && states[item.id] !== 'DISCONTINUED' ? (
                        <Button
                          secondary
                          title="Discontinue this medicine plan"
                          onPress={() =>
                            void run(async () => {
                              await open(await api.discontinue(document, item.id));
                              await store.refresh();
                              setNotice(
                                'Plan discontinued. Future reminders are removed when devices refresh.',
                              );
                            })
                          }
                        />
                      ) : null}
                    </View>
                  ))}
                  <Button
                    secondary
                    title="Add a missed medicine"
                    disabled={items.length >= 50}
                    onPress={() =>
                      changed([
                        ...items,
                        {
                          id: Crypto.randomUUID(),
                          evidence: { ...EMPTY_MEDICINE, timing: [] },
                          schedule: null,
                          verified: false,
                          fields: {},
                        },
                      ])
                    }
                  />
                  <Button
                    secondary
                    title="Save as draft — no alarms"
                    onPress={() =>
                      void run(async () => {
                        await save();
                        setPreview(null);
                        setNotice(
                          'Draft saved, including unresolved medicines. No new alarms were activated.',
                        );
                        setHistory(await api.history(member));
                      })
                    }
                  />
                  <Panel tinted>
                    <Label>
                      {reviewedCandidates(items, document.plans).length} of{' '}
                      {items.filter((item) => !document.plans[item.id]).length} new medicines
                      reviewed
                    </Label>
                    <Body>
                      In each medicine card, check the prescribed instructions, amount, unit, dates
                      and AM/PM times, then click “I reviewed and confirm this medicine”. The card
                      must show Reviewed. Editing it afterward clears its review.
                    </Body>
                    <Body>
                      Save as draft keeps unresolved medicines; it does not confirm them. Preview
                      includes only reviewed medicines without an existing plan.
                    </Body>
                    <ErrorNotice message={error} />
                    {notice ? <Body>{notice}</Body> : null}
                    {busy ? <Body>Saving or preparing schedules…</Body> : null}
                  </Panel>
                  <Button
                    title="Save and preview reviewed schedules"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        requireReviewedCandidates(items, document.plans);
                        const saved = await save();
                        setPreview(await api.preview(saved.id));
                      })
                    }
                  />
                  {preview ? (
                    <Panel>
                      <Label>Review schedules before activation</Label>
                      {Object.entries(preview).map(([id, result]) => (
                        <View key={id} style={{ gap: 8 }}>
                          <Body>
                            {items.find((item) => item.id === id)?.evidence.brand}:{' '}
                            {result.occurrences.length} upcoming occurrences · {result.timezone}
                          </Body>
                          <Body>
                            {result.occurrences
                              .slice(0, 4)
                              .map(
                                (dose) =>
                                  `${dose.localDate} ${timeLabel(dose.dueAt, result.timezone)}`,
                              )
                              .join(' · ')}
                          </Body>
                          <Body>{result.coverageNote}</Body>
                        </View>
                      ))}
                      <Body>
                        Confirm that every selected medicine, amount, food instruction, duration and
                        reminder time matches the verified prescription. Unreviewed entries remain
                        drafts.
                      </Body>
                      <Button
                        title="Confirm and activate these reviewed schedules"
                        onPress={() =>
                          void run(async () => {
                            await open(await api.activate(document, Object.keys(preview)));
                            await store.refresh();
                            setHistory(await api.history(member));
                            setNotice(
                              'Reviewed schedules saved. Check reminder readiness and coverage in Settings.',
                            );
                          })
                        }
                      />
                    </Panel>
                  ) : null}
                  <Button
                    secondary
                    title="Reload saved version (discard local edits)"
                    onPress={() => void run(async () => open(await api.get(document.id)))}
                  />
                  <Button
                    secondary
                    title="Close this prescription (save edits first)"
                    onPress={() => {
                      setDocument(null);
                      setPreview(null);
                      setSources([]);
                    }}
                  />
                </>
              ) : null}
              <PrescriptionHistory
                key={`history:${member}`}
                history={history}
                busy={busy || uploading}
                memberName={
                  store.members.find((person) => person.id === member)?.name || 'Selected member'
                }
                onRefresh={() => void run(async () => setHistory(await api.history(member)))}
                onOpen={(value) => void run(() => open(value))}
              />
            </View>
          ) : null}
        </>
      )}
      {busy ? <Body>Working… Keep this page open.</Body> : null}
      <ErrorNotice message={error} />
      {notice ? <Body>{notice}</Body> : null}
      <Button
        secondary
        title="Enter a medicine manually instead"
        disabled={busy || uploading}
        onPress={() => router.push('/schedule')}
      />
    </Screen>
  );
}
