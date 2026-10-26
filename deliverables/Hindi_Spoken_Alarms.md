# Hindi spoken medicine alarms

Open **Settings → Spoken alarm language** and enable **Hindi / हिंदी**. Enable medicine reminders and use the five-second test. Turn Hindi off to use English. This is a device preference; it does not change medicine records, dose quantities or reminder times.

Example: **Mohammad Ahmad, आपकी दवा DOLO लेने का समय हो गया है। कृपया अपनी दवा लें।**

In Chrome, Settings also shows **Selected local speech voice** and the local languages exposed by the browser. Use **Check / test selected voice now** to check immediately from a user click, without waiting for an alarm. Missing voices and blocked playback are reported immediately. A failed voice test does not suppress the timed tone/visual alarm.

On this workstation, checks of standard Windows Speech and OneCore voice registrations found no Hindi voice on 20 October 2026. Install Hindi using **Windows Settings → Time & language → Speech → Add voices**, restart Chrome, then run the app's direct voice test. See [Microsoft's supported voice installation guide](https://support.microsoft.com/en-au/accessibility/windows/narrator/appendix-a-supported-languages-and-voices). Windows installation alone does not prove Chrome exposes that voice; confirm the local language list in the app. No Windows voice pack was installed automatically by this change.

Medicine/member names stay exactly as entered. They are not translated or automatically transliterated. Pronunciation depends on the installed voice. Prescription instructions are not translated. The test announces that it is only a test in the selected language. Stock notifications and the rest of the interface are unchanged.

## Devices and delivery

- Browser: an installed local Hindi speech voice is required. No remote voice is selected. If missing, the tone and visual alert remain and Settings reports a speech error. Install a Hindi voice, restart the browser if needed and test again. Keep the tab open and device awake.
- Android: background alarms retain an explicit language in the existing encrypted alarm record. Old records default to English. Hindi uses an installed offline Hindi TTS voice; missing/failed speech falls back to the existing generic alarm tone and notification. Multiple medicines retain sequential speech and the existing stop/deadline behavior.
- Other native foreground speech uses the selected `hi-IN` or `en-IN` language. Locked/closed-app speech remains Android-specific. Physical-device behavior still needs validation.

Changing language stops current speech, cancels pending test alarms and refreshes upcoming registrations without changing occurrence IDs or due times. Existing due/delivering alerts retain the normal delivery grace rules. Confirm the new language with a fresh test. The preference is saved locally (SecureStore on native; only the language string in browser localStorage). If language restoration fails, existing registrations are preserved until setup can be completed.

## Android build requirement

This change updates the custom Android service. An older installed APK cannot gain Hindi background speech from a JavaScript reload. Build/install the updated app using the project's local Android Studio/development workflow, then enable Hindi and run the test. Expo Go cannot run the custom background service. No paid EAS build was started.

## Verification

All 29 mobile tests pass, including Hindi message content, exact Hindi browser voice selection, missing-Hindi-voice behavior, foreground `hi-IN` speech, language-change re-registration and unchanged alarm identities/times. TypeScript, ESLint and formatting checks pass. The updated Android module compiles and its existing native unit tests pass with Gradle BUILD SUCCESSFUL in offline local validation, using the installed NDK 28.2 override. This did not assemble/install an APK or verify audible Hindi speech, locked-screen delivery or installed-device voice availability. Backend behavior is unchanged. No new package, cloud speech service, SMS or paid build was used.
