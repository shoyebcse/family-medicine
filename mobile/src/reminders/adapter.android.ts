import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { testMessage, type AlarmLanguage } from './language';
import {
  TEST_PREFIX,
  type ReminderAdapter,
  type ReminderCapabilities,
  type ReminderRegistration,
  type ReminderSignal,
} from './types';

type SpokenAlarmModule = {
  scheduleInLanguage?(
    key: string,
    dueAt: number,
    message: string,
    test: boolean,
    language: string,
  ): Promise<void>;
  addListener(event: 'alarm', listener: (signal: ReminderSignal) => void): { remove(): void };
  inspect(): Promise<{
    exactAlarm: boolean;
    notifications: boolean;
    channelEnabled: boolean;
    audioFailure: boolean;
    enabled: boolean;
  }>;
  list(): Promise<ReminderRegistration[]>;
  schedule(key: string, dueAt: number, message: string, test: boolean): Promise<void>;
  cancel(key: string): Promise<void>;
  dismiss(): Promise<void>;
  clearError(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
};
const native = requireOptionalNativeModule<SpokenAlarmModule>('SpokenAlarm');
const BUILD_MESSAGE =
  'Install the Family Medicine Android build to use spoken alarms. Expo Go cannot run this alarm service.';

/** AlarmManager + foreground TTS service own Android delivery, without a JS runtime. */
export class PlatformReminderAdapter implements ReminderAdapter {
  private language: AlarmLanguage = 'en-IN';
  async setLanguage(language: AlarmLanguage) {
    if (native && !native.scheduleInLanguage && language === 'hi-IN')
      throw new Error(
        'Install an updated Android build for Hindi background alarms. This native change cannot be delivered by JavaScript reload alone.',
      );
    this.language = language;
  }
  private error: string | undefined;
  async inspect(): Promise<ReminderCapabilities> {
    const status = await native?.inspect();
    return {
      platform: 'native',
      backgroundSpeech: !!native,
      exactAlarm: status?.exactAlarm ?? false,
      notifications: status?.notifications ? 'granted' : 'denied',
      sound: !!status?.channelEnabled && !status.audioFailure,
      canSchedule: !!status?.exactAlarm && status.notifications && status.channelEnabled,
      speechError: !native
        ? BUILD_MESSAGE
        : (this.error ??
          (status?.audioFailure
            ? 'A spoken alarm failed. Check alarm volume, an installed offline voice for the selected Hindi/English language and Android permissions; then re-enable reminders.'
            : undefined)),
    };
  }
  async enable() {
    if (!native) throw new Error(BUILD_MESSAGE);
    await Notifications.requestPermissionsAsync();
    if (!(await Notifications.getExactAlarmPermissionsAsync()).granted)
      await Notifications.requestExactAlarmPermissionsAsync();
    await native.clearError();
    this.error = undefined;
    await this.clearLegacy();
  }
  private async clearLegacy() {
    // Cancel legacy Expo registrations to avoid duplicate notification alarms after migration.
    for (const request of await Notifications.getAllScheduledNotificationsAsync())
      if (request.content.data?.familyMedicine === true)
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  async restoreEnabled() {
    if (!native) return false;
    await this.clearLegacy();
    return (await native?.inspect())?.enabled ?? false;
  }
  async saveEnabled(enabled: boolean) {
    if (native) await native.setEnabled(enabled);
    if (!enabled) this.stopSound();
  }
  async requestDesktopPermission() {}
  async list() {
    return native ? native.list() : [];
  }
  async schedule(item: ReminderRegistration) {
    if (!native) throw new Error(BUILD_MESSAGE);
    if (!item.message)
      throw new Error('Reminder speech text is missing. Refresh the medicine plan.');
    if (native.scheduleInLanguage)
      await native.scheduleInLanguage(
        item.key,
        item.dueAt,
        item.message,
        item.key.startsWith(TEST_PREFIX),
        item.language ?? this.language,
      );
    else
      await native.schedule(item.key, item.dueAt, item.message, item.key.startsWith(TEST_PREFIX));
  }
  async cancel(key: string) {
    if (native) await native.cancel(key);
  }
  async test() {
    await this.schedule({
      key: `${TEST_PREFIX}native`,
      dueAt: Date.now() + 5000,
      message: testMessage(this.language),
    });
  }
  stopSound() {
    void native?.dismiss().catch(() => {
      this.error = 'Could not dismiss the spoken alarm. Use Dismiss on its Android notification.';
    });
  }
  subscribe(listener: (signal: ReminderSignal) => void) {
    const subscription = native?.addListener('alarm', listener);
    return () => subscription?.remove();
  }
  dispose() {
    /* Installed native service owns playback and survives React lifecycle changes. */
  }
}
