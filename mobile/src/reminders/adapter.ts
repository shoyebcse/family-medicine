import { AppState, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import type { AlarmLanguage } from './language';
import { NativeReminderSpeech } from './nativeSpeech';
import { shouldPresent } from './plan';
import * as Notifications from 'expo-notifications';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
  IosAuthorizationStatus,
} from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {
  TEST_PREFIX,
  type ReminderAdapter,
  type ReminderCapabilities,
  type ReminderRegistration,
  type ReminderSignal,
} from './types';

const CHANNEL = 'medicine-reminders-v1';
const ENABLED_KEY = 'family-medicine.reminders.enabled.v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Native registry is the OS pending-notification list, retained when the app process exits. */
export class PlatformReminderAdapter implements ReminderAdapter {
  private voiceAvailable = true;
  async setLanguage(language: AlarmLanguage) {
    this.voiceAvailable = (await Speech.getAvailableVoicesAsync()).some((voice) =>
      voice.language.toLowerCase().startsWith(language.slice(0, 2)),
    );
    this.speech.setLanguage(language);
  }
  private readonly speech = new NativeReminderSpeech(
    Speech,
    () => AppState.currentState === 'active',
  );
  async inspect(): Promise<ReminderCapabilities> {
    const permission = await Notifications.getPermissionsAsync();
    const exact =
      Platform.OS !== 'android' || (await Notifications.getExactAlarmPermissionsAsync()).granted;
    const channel =
      Platform.OS === 'android' ? await Notifications.getNotificationChannelAsync(CHANNEL) : null;
    const allowed =
      Platform.OS === 'ios'
        ? permission.ios?.status === IosAuthorizationStatus.AUTHORIZED
        : permission.granted;
    return {
      platform: 'native',
      speechError: this.speech.error,
      notifications: allowed ? 'granted' : permission.canAskAgain ? 'prompt' : 'denied',
      exactAlarm: exact,
      sound:
        Platform.OS === 'ios'
          ? permission.ios?.allowsSound === true
          : !!channel && channel.sound !== null && channel.importance !== AndroidImportance.NONE,
      canSchedule:
        allowed &&
        exact &&
        (Platform.OS !== 'android' || (!!channel && channel.importance !== AndroidImportance.NONE)),
    };
  }
  async enable() {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Medicine reminders',
        description: 'Reminders for reviewed medicine schedules',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 300, 200, 300],
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
        audioAttributes: {
          usage: AndroidAudioUsage.ALARM,
          contentType: AndroidAudioContentType.SONIFICATION,
        },
      });
    const permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    if (!permission.granted && permission.ios?.status !== IosAuthorizationStatus.AUTHORIZED) return;
    if (Platform.OS === 'android' && !(await Notifications.getExactAlarmPermissionsAsync()).granted)
      await Notifications.requestExactAlarmPermissionsAsync();
  }
  async restoreEnabled() {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === 'true';
  }
  async saveEnabled(enabled: boolean) {
    if (!enabled) this.stopSound();
    await SecureStore.setItemAsync(ENABLED_KEY, String(enabled));
  }
  async requestDesktopPermission() {
    /* Native permissions are handled by enable(). */
  }
  async list(): Promise<ReminderRegistration[]> {
    return (await Notifications.getAllScheduledNotificationsAsync()).map((request) => ({
      key: request.identifier,
      dueAt: typeof request.content.data?.dueAt === 'number' ? request.content.data.dueAt : 0,
    }));
  }
  async schedule(item: ReminderRegistration) {
    if (item.dueAt <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      identifier: item.key,
      content: {
        title: 'Family Medicine',
        body: item.key.startsWith(TEST_PREFIX)
          ? 'This is a test reminder.'
          : 'A medicine reminder is due.',
        sound: 'default',
        data: { familyMedicine: true, dueAt: item.dueAt, test: item.key.startsWith(TEST_PREFIX) },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(item.dueAt),
        channelId: CHANNEL,
        delivery: 'alarmClock',
      },
    });
  }
  async cancel(key: string) {
    await Notifications.cancelScheduledNotificationAsync(key);
  }
  async test() {
    await this.schedule({ key: `${TEST_PREFIX}native`, dueAt: Date.now() + 5000 });
  }
  stopSound() {
    this.speech.stop();
    /* OS notification tones are controlled by the notification channel. */
  }
  speak(message: string) {
    if (!this.voiceAvailable) {
      this.speech.error =
        'Install the selected Hindi/English speech voice in device settings. The notification remains available.';
      return;
    }
    this.speech.speak(message);
  }
  subscribe(listener: (signal: ReminderSignal) => void) {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') this.stopSound();
    });
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (
        AppState.currentState === 'active' &&
        data?.familyMedicine === true &&
        typeof data.dueAt === 'number' &&
        shouldPresent(data.dueAt, Date.now())
      )
        listener({
          key: notification.request.identifier,
          test: data.test === true,
        });
    });
    return () => {
      subscription.remove();
      appState.remove();
      this.stopSound();
    };
  }
  dispose() {
    this.stopSound();
    /* Keep OS-scheduled reminders when the app closes. */
  }
}
