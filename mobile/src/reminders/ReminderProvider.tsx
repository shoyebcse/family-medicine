import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, colors, Label } from '../components/ui';
import { useMedicine } from '../state/MedicineProvider';
import { PlatformReminderAdapter } from './adapter';
import { ReminderCoordinator } from './coordinator';
import { spokenReminder } from './speech';
import { type AlarmLanguage } from './language';
import { readAlarmLanguage, saveAlarmLanguage } from './languageStore';
import { TEST_PREFIX } from './types';
import type {
  ReminderAdapter,
  ReminderCapabilities,
  ReminderReport,
  ReminderSignal,
} from './types';

type ReminderState = {
  language: AlarmLanguage;
  changeLanguage(language: AlarmLanguage): Promise<void>;
  enabled: boolean;
  busy: boolean;
  capabilities: ReminderCapabilities | null;
  report: ReminderReport | null;
  error: string | null;
  testMessage: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
  test(): Promise<void>;
  testSpeech(): void;
  refreshStatus(): Promise<void>;
  requestDesktopPermission(): Promise<void>;
};
const Context = createContext<ReminderState | null>(null);

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { reminderDoses, loading, lastSync, refresh } = useMedicine();
  const [adapter] = useState<ReminderAdapter>(() => new PlatformReminderAdapter());
  const [coordinator] = useState(() => new ReminderCoordinator(adapter));
  const [enabled, setEnabled] = useState(false);
  const [language, setLanguage] = useState<AlarmLanguage>('en-IN');
  const languageNow = useRef<AlarmLanguage>('en-IN');
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState<ReminderCapabilities | null>(null);
  const [report, setReport] = useState<ReminderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [signals, setSignals] = useState<ReminderSignal[]>([]);
  const enabledNow = useRef(false);
  const latestSnapshot = useRef({ doses: reminderDoses, lastSync });
  const statusGeneration = useRef(0);
  const operationInProgress = useRef(false);
  const settingsReady = useRef(false);

  useEffect(() => {
    latestSnapshot.current = { doses: reminderDoses, lastSync };
    statusGeneration.current += 1;
  }, [reminderDoses, lastSync]);

  const refreshStatus = useCallback(async () => {
    const generation = ++statusGeneration.current;
    try {
      const capabilities = await adapter.inspect();
      if (generation !== statusGeneration.current) return;
      setCapabilities(capabilities);
      if (!settingsReady.current) {
        setError(
          'Could not restore alarm language. Existing device alarms are left unchanged. Choose a language or enable reminders again.',
        );
        return;
      }
      if (!latestSnapshot.current.lastSync) {
        setError(
          'Connect and load the medicine plan before changing reminder coverage. Existing phone reminders are left in place.',
        );
        return;
      }
      const result = await coordinator.reconcile(
        latestSnapshot.current.doses,
        enabledNow.current,
        languageNow.current,
      );
      if (generation !== statusGeneration.current) return;
      setReport(result);
      setError(null);
    } catch (e) {
      if (generation !== statusGeneration.current) return;
      setError(e instanceof Error ? e.message : 'Could not update reminders. Try again.');
    }
  }, [adapter, coordinator]);
  useEffect(() => {
    let active = true;
    Promise.all([adapter.restoreEnabled(), readAlarmLanguage()])
      .then(async ([value, savedLanguage]) => {
        await adapter.setLanguage?.(savedLanguage);
        if (active) {
          languageNow.current = savedLanguage;
          settingsReady.current = true;
          setLanguage(savedLanguage);
          enabledNow.current = value;
          setEnabled(value);
          setRestored(true);
        }
      })
      .catch(() => {
        if (active) {
          setRestored(true);
          setError('Could not restore reminder settings. Enable reminders again.');
        }
      });
    const unsubscribe = adapter.subscribe((signal) => {
      const message = spokenReminder(signal, latestSnapshot.current.doses, languageNow.current);
      if (message) adapter.speak?.(message);
      void adapter.inspect().then((current) => {
        if (active) setCapabilities(current);
      });
      setSignals((previous) =>
        previous.some((p) => p.key === signal.key) ? previous : [...previous, signal],
      );
      if (signal.test)
        setTestMessage(
          'Test alert received in the app. Confirm that you heard or saw it on your device.',
        );
    });
    const unsubscribeStatus = adapter.subscribeStatus?.(() => {
      void adapter
        .inspect()
        .then((current) => {
          if (active) setCapabilities(current);
        })
        .catch(() => {});
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribeStatus?.();
      adapter.dispose();
    };
  }, [adapter]);
  useEffect(() => {
    if (!restored || loading) return;
    const timer = setTimeout(() => {
      void refreshStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [restored, loading, reminderDoses, lastSync, enabled, refreshStatus]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
        void refreshStatus();
      }
    });
    return () => subscription.remove();
  }, [refresh, refreshStatus]);

  const enable = useCallback(async () => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    statusGeneration.current += 1;
    setBusy(true);
    setError(null);
    try {
      // Adapter enable starts browser audio directly in this click's call stack.
      await adapter.enable();
      await adapter.setLanguage?.(languageNow.current);
      await saveAlarmLanguage(languageNow.current);
      settingsReady.current = true;
      if (!latestSnapshot.current.lastSync)
        throw new Error('Load the medicine plan successfully before enabling its reminders.');
      const state = await adapter.inspect();
      setCapabilities(state);
      if (!state.canSchedule)
        throw new Error(
          'Permission setup is incomplete. Allow notifications and, on Android, Alarms & reminders, then try again.',
        );
      await adapter.saveEnabled(true);
      enabledNow.current = true;
      setEnabled(true);
      setReport(
        await coordinator.reconcile(latestSnapshot.current.doses, true, languageNow.current),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable reminders.');
    } finally {
      operationInProgress.current = false;
      setBusy(false);
    }
  }, [adapter, coordinator]);
  const disable = useCallback(async () => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    enabledNow.current = false;
    statusGeneration.current += 1;
    setBusy(true);
    setError(null);
    try {
      await adapter.saveEnabled(false);
      setEnabled(false);
      adapter.stopSound();
      setSignals([]);
      setTestMessage(null);
      setReport(await coordinator.reconcile([], false));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel reminders. Try again.');
    } finally {
      operationInProgress.current = false;
      setBusy(false);
    }
  }, [adapter, coordinator]);
  const test = useCallback(async () => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!enabled) throw new Error('Enable reminders before sending a test.');
      if (!(await adapter.inspect()).canSchedule)
        throw new Error('Reminder permissions changed. Complete setup and try again.');
      await adapter.test();
      setTestMessage(
        'Test scheduled for about 5 seconds from now. Keep this screen open to check it.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule the test.');
    } finally {
      operationInProgress.current = false;
      setBusy(false);
    }
  }, [adapter, enabled]);
  const requestDesktopPermission = useCallback(async () => {
    try {
      await adapter.requestDesktopPermission();
      setCapabilities(await adapter.inspect());
    } catch {
      setError('Browser notifications could not be enabled. Tab alerts still work while open.');
    }
  }, [adapter]);
  const dismiss = () => {
    adapter.stopSound();
    setSignals([]);
  };
  const testSpeech = useCallback(() => {
    adapter.testSpeech?.();
    void adapter
      .inspect()
      .then(setCapabilities)
      .catch(() => setError('Could not check the speech voice.'));
  }, [adapter]);
  const changeLanguage = useCallback(
    async (next: AlarmLanguage) => {
      if (operationInProgress.current) return;
      operationInProgress.current = true;
      statusGeneration.current++;
      setBusy(true);
      setError(null);
      const previous = languageNow.current;
      try {
        if (!settingsReady.current) {
          enabledNow.current = await adapter.restoreEnabled();
          setEnabled(enabledNow.current);
        }
        if (enabledNow.current && !latestSnapshot.current.lastSync)
          throw new Error(
            'Load the medicine plan before changing the language of scheduled alarms.',
          );
        adapter.stopSound();
        setSignals([]);
        await adapter.setLanguage?.(next);
        await saveAlarmLanguage(next);
        languageNow.current = next;
        settingsReady.current = true;
        setLanguage(next);
        for (const item of await adapter.list())
          if (item.key.startsWith(TEST_PREFIX)) await adapter.cancel(item.key);
        if (latestSnapshot.current.lastSync)
          setReport(
            await coordinator.reconcile(latestSnapshot.current.doses, enabledNow.current, next),
          );
      } catch (e) {
        if (languageNow.current === previous) await adapter.setLanguage?.(previous).catch(() => {});
        setError(
          e instanceof Error
            ? e.message
            : 'Could not change alarm language. Refresh reminder coverage and try again.',
        );
      } finally {
        operationInProgress.current = false;
        setBusy(false);
      }
    },
    [adapter, coordinator],
  );
  const value = useMemo(
    () => ({
      enabled,
      language,
      changeLanguage,
      busy: busy || !restored,
      capabilities,
      report,
      error,
      testMessage,
      enable,
      disable,
      test,
      testSpeech,
      refreshStatus,
      requestDesktopPermission,
    }),
    [
      enabled,
      language,
      changeLanguage,
      busy,
      restored,
      capabilities,
      report,
      error,
      testMessage,
      enable,
      disable,
      test,
      testSpeech,
      refreshStatus,
      requestDesktopPermission,
    ],
  );
  const onlyTests = signals.length > 0 && signals.every((s) => s.test);
  return (
    <Context.Provider value={value}>
      {children}
      <Modal transparent visible={signals.length > 0} animationType="fade" onRequestClose={dismiss}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Label>{onlyTests ? 'Test medicine reminder' : 'A medicine reminder is due'}</Label>
            <Body>
              {onlyTests
                ? 'This is a test. It does not represent a medicine dose.'
                : `${signals.filter((s) => !s.test).length} reminder(s) are due. Open Today to review the medicine plan.`}
            </Body>
            <Body>Dismissing this alert does not mark any dose Taken or Skipped.</Body>
            <Button title="Dismiss reminder" onPress={dismiss} />
            <Button
              title="View Today"
              secondary
              onPress={() => {
                dismiss();
                router.replace('/');
              }}
            />
          </View>
        </View>
      </Modal>
    </Context.Provider>
  );
}
export function useReminders() {
  const state = useContext(Context);
  if (!state) throw new Error('useReminders must be used inside ReminderProvider');
  return state;
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#16382F99',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    padding: 24,
    gap: 18,
    borderRadius: 22,
    backgroundColor: colors.white,
  },
});
