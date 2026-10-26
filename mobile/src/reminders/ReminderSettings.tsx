import { Linking, Platform, Switch, Text, View } from 'react-native';
import { Body, Button, colors, Label, Panel } from '../components/ui';
import { useMedicine } from '../state/MedicineProvider';
import { useReminders } from './ReminderProvider';

function timestamp(value: number) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
export function ReminderSettings() {
  const state = useReminders();
  const { demo } = useMedicine();
  const browser = Platform.OS === 'web';
  return (
    <Panel>
      <Label>Spoken alarm language</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Switch
          accessibilityLabel="Speak medicine alarms in Hindi"
          value={state.language === 'hi-IN'}
          disabled={state.busy}
          onValueChange={(enabled) => void state.changeLanguage(enabled ? 'hi-IN' : 'en-IN')}
        />
        <View style={{ flex: 1 }}>
          <Body>Hindi / हिंदी: {state.language === 'hi-IN' ? 'On' : 'Off (English)'}</Body>
        </View>
      </View>
      <Body>
        Enable Hindi for spoken medicine/member reminders. Install a Hindi text-to-speech voice on
        your device and use the five-second test. Names stay as entered. Android background speech
        requires the updated native build; no paid speech service is used.
      </Body>
      {browser ? (
        <>
          <Body>
            {state.capabilities?.speechVoice
              ? `Selected local speech voice: ${state.capabilities.speechVoice}`
              : `No local ${state.language === 'hi-IN' ? 'Hindi' : 'English'} voice is currently available to this browser.`}
          </Body>
          <Body>
            Local voice languages Chrome reports:{' '}
            {state.capabilities?.localSpeechLanguages?.join(', ') || 'none loaded yet'}.
          </Body>
          <Button
            title="Check / test selected voice now"
            secondary
            disabled={state.busy}
            onPress={state.testSpeech}
          />
          {state.language === 'hi-IN' && !state.capabilities?.speechVoice ? (
            <Body>
              On Windows, open Settings → Time & language → Speech → Add voices and install Hindi.
              Restart Chrome, reopen the app and test again. If Chrome still lists no local Hindi
              voice, Hindi speech is unavailable there; the alarm will keep its tone. Selecting
              Hindi in the app does not install a voice.
            </Body>
          ) : null}
        </>
      ) : null}
      <Label>
        {state.enabled
          ? state.capabilities?.canSchedule && !state.error
            ? browser
              ? 'Browser tab reminders enabled'
              : 'Local reminders enabled'
            : 'Reminder setup needs attention'
          : 'Reminders are off'}
      </Label>
      <Body>
        {browser
          ? 'Enable sound with the button below. Keep this tab open and the computer awake. Closing, reloading, sleeping or suspending the tab can stop or delay alerts. This is not a phone alarm.'
          : 'This device schedules local notifications for upcoming reviewed doses. Android needs notification and Alarms & reminders permissions. Sound also depends on volume and device settings.'}
      </Body>
      {demo && (
        <Body>
          Sample-data mode: these include fictional sample schedules. Custom schedules reset when
          you reload.
        </Body>
      )}
      {!browser && (
        <Body>
          {Platform.OS === 'android'
            ? 'The installed Android build speaks medicine and member names even with the screen locked or after swiping the app away. Use Dismiss on the alarm notification to stop it, or it stops after 30 seconds. Names are audible to people nearby. An offline text-to-speech voice for the selected Hindi/English language and alarm volume are required. Expo Go cannot run this service. After Force Stop, reopen the app to restore alarms; after reboot, unlock the phone first.'
            : 'On iOS, spoken reminders work while the app is open and stop when you leave it. Closed-app spoken alarms are not implemented for iOS.'}{' '}
          The five-second test speaks DOLO and Mohammad Ahmad as fictional examples. Native device
          validation is still required before relying on delivery.
        </Body>
      )}
      {!browser && (
        <Body>
          Development setup is local to this device. Server-enforced primary-device assignment and
          transfer are not implemented yet.
        </Body>
      )}
      <Button
        title={
          state.enabled
            ? browser
              ? 'Re-enable sound and reconcile'
              : 'Review permissions and reconcile'
            : browser
              ? 'Enable tab reminders and sound'
              : 'Enable reminders on this device'
        }
        disabled={state.busy}
        onPress={() => void state.enable()}
      />
      {state.enabled && (
        <>
          <Button
            title="Test reminder in 5 seconds"
            secondary
            disabled={state.busy}
            onPress={() => void state.test()}
          />
          <Button
            title="Turn off reminders"
            secondary
            disabled={state.busy}
            onPress={() => void state.disable()}
          />
        </>
      )}
      {browser && (
        <Body>
          Enabling or re-enabling plays three beeps immediately. If you cannot hear them, unmute
          this Chrome tab, allow Sound in Chrome site settings and check speaker volume. Then use
          the 5-second test. Sound readiness cannot confirm that your speakers are audible. Browser
          reminders also say the medicine and member name aloud using an installed device voice. The
          spoken message repeats after a short pause until dismissed or the 30-second alarm ends.
          The test uses DOLO and Mohammad Ahmad as examples. Keep the tab open.
        </Body>
      )}
      {state.capabilities && (
        <>
          <Body>
            Notification permission: {state.capabilities.notifications}. Sound:{' '}
            {state.capabilities.sound ? 'enabled in app/channel' : 'not ready or disabled'}.
          </Body>
          {browser && state.capabilities.audioError && <Body>{state.capabilities.audioError}</Body>}
          {state.capabilities.speechError && <Body>{state.capabilities.speechError}</Body>}
          {browser && state.capabilities.lastTriggeredAt && (
            <Body>Last alert triggered: {timestamp(state.capabilities.lastTriggeredAt)}.</Body>
          )}
          {!browser && (
            <Body>
              Exact-alarm permission: {state.capabilities.exactAlarm ? 'allowed' : 'not allowed'}.
            </Body>
          )}
          {browser && state.capabilities.notifications === 'prompt' && (
            <Button
              title="Allow browser desktop notifications"
              secondary
              onPress={() => void state.requestDesktopPermission()}
            />
          )}
          {browser && state.capabilities.notifications === 'denied' && (
            <Body>
              Desktop notifications are blocked. The in-app alert and enabled sound can still work
              in the open tab.
            </Body>
          )}
          {!browser && (
            <Button
              title="Open app notification settings"
              secondary
              onPress={() => void Linking.openSettings()}
            />
          )}
        </>
      )}
      {state.report && state.enabled && (
        <>
          <Body>{state.report.count} upcoming reminder(s) registered.</Body>
          <Body>
            {state.report.nextDueAt
              ? `Next: ${timestamp(state.report.nextDueAt)} · Asia/Kolkata`
              : 'No upcoming reminders are registered. Check your schedule and permissions.'}
          </Body>
          {state.report.lastScheduledAt !== null && (
            <Body>
              Last registered reminder: {timestamp(state.report.lastScheduledAt)}. This is not a
              guarantee of uninterrupted coverage.
            </Body>
          )}
          {state.report.omitted > 0 && (
            <Body>
              {state.report.omitted} upcoming reminder(s) did not fit the current scheduling budget.
              Reopen the app to replenish coverage.
            </Body>
          )}
          <Body>
            Last reconciliation: {timestamp(state.report.reconciledAt)}. The app aims for seven days
            where its pending budget allows.
          </Body>
        </>
      )}
      {state.testMessage && <Body>{state.testMessage}</Body>}
      {state.error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {state.error}
        </Text>
      )}
      <Button
        title="Recheck reminder readiness"
        secondary
        disabled={state.busy}
        onPress={() => void state.refreshStatus()}
      />
      <Body>
        Alert dismissal never records a dose. Overdue alerts are not replayed after the app resumes.
      </Body>
    </Panel>
  );
}
