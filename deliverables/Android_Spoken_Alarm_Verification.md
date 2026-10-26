# Android spoken alarms

The Android-specific adapter uses the local `spoken-alarm` Expo module. AlarmManager starts a media-playback foreground service at the reviewed occurrence's UTC instant. That service owns text-to-speech, repetition and dismissal without requiring a React/JavaScript runtime or an internet connection. The browser and iOS paths remain separate.

## Install a build

Expo Go cannot load this custom module, regardless of its SDK version. This project remains on SDK 58. Build an internal APK using the checked-in EAS preview profile:

```powershell
cd E:\dev\med-health-app\mobile
npx eas-cli@latest build --platform android --profile preview
```

This uses the developer's Expo account and cloud build configuration. The generated APK includes its JavaScript bundle and does not require a running Metro server. No EAS build has been submitted merely by adding this configuration.

For local compilation, generate Android using `npx expo prebuild --platform android --no-install`, then compile `:spoken-alarm:compileDebugKotlin` and run `:spoken-alarm:testDebugUnitTest` with Gradle. Generated `mobile/android` files are ignored and must not be hand edited. SDK 58 requires its matching Android SDK/toolchain.

## Expected behavior

- Enable notifications and Android Alarms & reminders. Enabling explicitly allows names to be spoken aloud, including on the lock screen.
- Each queued record contains its stable occurrence ID, UTC due time, speech text and a fresh delivery token. The speech text is encrypted using an Android Keystore AES-GCM key in credential-protected, non-backup storage. PendingIntent identifiers and notification content contain no medicine or member names.
- Changing names updates the queued speech. Accepted time changes replace the old alarm. Taken, Skipped, deleted records and disabling reminders cancel queued alarms; cancelling a currently playing occurrence stops its speech too.
- A matching delivery token and a due instant less than one minute late are required. Successfully consumed alarms are removed before speech, preventing duplicate replay. This delivery record is not dose evidence and does not mark Taken, Skipped or deduct stock.
- An offline English device voice uses alarm audio attributes. Simultaneous occurrences queue in one service. The service repeats after completion plus a five-second pause, stops after 30 seconds, respects audio focus and offers notification Dismiss. Missing voice/engine failure falls back to an alarm tone and records an actionable error.
- Swiping away the app or locking the screen does not intentionally stop the native service. Reboot restores future alarms only after the first unlock; the boot receiver never starts speech itself. Reopening after Android Force Stop re-registers future alarms. Force Stop, powered-off devices, muted alarm volume, revoked permissions and manufacturer battery restrictions can prevent delivery.
- Only queued occurrences are available while closed; newly changed remote records require synchronization. Encrypted alarm text is not a complete encrypted offline health-record implementation.

## Physical-device checks required

Use fictional data. A bundle export or Kotlin compilation does not validate actual audio delivery.

1. Install the APK, enable permissions, set alarm volume and install an offline English TTS voice. Run the five-second test with the app open: hear the explicitly fictional DOLO/Mohammad Ahmad message.
2. Run another test and lock the screen before five seconds. Confirm named speech, repeat pause, generic lock-screen notification and working Dismiss.
3. Schedule a future fictional occurrence, swipe the app from Recents, disconnect Wi-Fi and confirm its names are spoken. Verify no dose/stock mutation occurs.
4. Schedule simultaneous reminders for two fictional members. Confirm each speaks and repeats without overlapping itself. Verify automatic stop at 30 seconds.
5. Edit the upcoming time/name, mark Taken/Skipped, delete the occurrence and disable reminders in separate cases. Verify old speech is never delivered; changing a currently active occurrence cancels its playback.
6. Reboot with a future alarm and unlock before it is due. Confirm future delivery; confirm a passed alarm does not replay after late unlock.
7. Force Stop via Android settings: expect delivery to be blocked. Reopen the app and verify future alarms are restored.
8. Revoke notifications/exact-alarm access, remove offline voices and test audio focus interruption. Confirm visible readiness/errors, bounded fallback and no crash.

Record device model, Android version, build hash and outcomes before claiming this release gate passed.

## Automated results — 19 October 2026

- All 19 TypeScript reminder tests pass, including metadata replacement when names change. TypeScript, ESLint and formatting checks pass.
- Android Hermes bundle export passes and resolves the Android-specific service adapter.
- Expo autolinking discovers `spoken-alarm`; Kotlin compilation and `:spoken-alarm:testDebugUnitTest` pass. The native test checks the exact due/lateness boundary and refuses future or stale delivery.
- Local native validation used installed NDK 28.2.13676358 through `mobile/scripts/local-native-validation.gradle` because the default NDK download stalled. This override is opt-in via `MEDICINE_VALIDATION_NDK`; EAS keeps Expo's default toolchain.
- No APK has been assembled or installed by these checks. No Android device was connected; the physical-device checks above remain outstanding.
