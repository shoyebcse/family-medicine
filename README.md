# Family Medicine

Android-first React Native and TypeScript app with a Spring Boot API and PostgreSQL schema. This is the first implementation slice of the technical specification, not the complete MVP.

## Implemented

- Today, Family, History and Settings tabs with loading, empty and error states.
- Managed family profiles and reviewed manual daily/weekday schedules.
- Add Medicine separates product strength from amount/unit and captures generic/composition, form, route, frequency and meal directions. Dates start blank; changes require renewed review. [Field examples and limits](deliverables/Add_Medicine_Examples.md).
- Optional per-medicine low-stock thresholds, persistent in-app warnings and generic local notifications when permitted. Configure new medicines or change thresholds in Family. [Stock alert examples and delivery limits](deliverables/Low_Stock_Alerts.md).
- Explicit times, inclusive dates, timezone and end-condition validation, with preview before activation.
- Backend occurrence generation with stable IDs, DST gap/fold rules and no pre-activation doses.
- Taken/Skipped confirmation, early Taken confirmation, idempotent requests and transactional stock deduction using the same explicit unit.
- Owner-scoped member, schedule and dose APIs; database migrations; domain and service integration tests.
- An in-memory sample-data adapter for trying the UI before starting the backend.
- Email/password registration and login, expiring/revocable sessions, native secure session storage, account isolation and development phone-code login. See [account setup](deliverables/Authentication_Development_Setup.md) for examples and limitations.
- Relationship dropdown, optional member mobile number and consented managed-profile sharing: invite, recipient acceptance, final owner approval and revocation. [Family access examples](deliverables/Family_Access_Development_Setup.md).
- Device reminder setup, five-second test, generic notification text, rolling registration and cancellation after Taken/Skipped. Browser tab alerts include an enabled sound; native notification code includes Android exact-alarm permission checks.
- Prescription camera/upload flow, ordered multi-page JPG/PNG/PDF preview, crop/rotate/retake, `gpt-4o-mini` extraction adapter, editable multi-medicine drafts, patient routines, batch preview/activation, source history and discontinuation. Real extraction stays disabled until a private backend key is configured. See [setup, examples, FR-01–FR-06 coverage and limitations](deliverables/Prescription_Extraction_Setup.md).

## Configure prescription extraction

**Local functional testing:** the root `.env` now sets `PRESCRIPTION_EXTRACTION_MODE=mock`. Restart the backend to apply it, then reopen the prescription upload page. The button becomes **Load mock prescription — no API cost**. This dev-only mode returns the user's fixed six-medicine JSON from `backend/src/main/resources/development/prescription-fixture.json` exactly, regardless of uploaded content. It bypasses OpenAI even when a real key and live-extraction flag are present. Normal authentication, upload validation, draft storage, review and schedule validation remain active. Mock prescriptions/history and linked dose cards are explicitly labelled; provenance is persisted by migration V8. Existing live imports are not changed.

To return to real extraction later, set `PRESCRIPTION_EXTRACTION_MODE=openai` and restart the backend; the API key and `PRESCRIPTION_EXTRACTION_ENABLED=true` are then required. Never use mock data as a real treatment plan. In the supplied fixture, `Daily` plus a pattern in `dose` is preserved unchanged, so users must still confirm the numeric amount/unit, explicit supported daily frequency, dates and reminder times before preview. SOS stays a draft. The mock is not an automatic parser or a way to bypass review. A production profile cannot use the dev mock provider; setting mock mode outside dev also disables the live adapter rather than silently making paid calls.

Extraction quality update (23 October 2026): comparison of a supplied two-page scanned prescription and its logged response showed clinical-note/heading false positives and unreliable continuation-page transcription. The original user prompt and `gpt-4o-mini` selection are preserved. Supplemental guidance now separates treatment rows from symptoms, investigations and footer text, requires verbatim treatment-row evidence and medicine names as written, and inspects all numbered/continuation rows without guessing drugs. Each input page is explicitly labelled in order; temperature is zero to reduce sampling variation. Missing medicine identity, dose, frequency or duration forces `unclear=true` even when the model reports false. These are safeguards, not proof of improved handwriting accuracy: no live re-extraction was performed. Existing saved imports are not silently rewritten; start a new upload after restarting the backend to evaluate the updated request.

To debug extraction, set `OPENAI_LOG_RESPONSES=true` in the private root `.env` and restart the backend. The local setting was enabled on 23 October 2026 at the user's request. In the `dev` profile, the backend terminal logs `OpenAI extraction RAW_RESPONSE`, HTTP status, provider request ID, page count and parsed medicine/unclear counts. Bodies are bounded to 64 KiB, escaped to prevent forged log lines, and API keys/image data URLs are redacted. Raw bodies can contain patient/prescription details: keep logs private and set the flag to `false` when finished. Raw response logging is disabled by default and ignored outside `dev`. No diagnostic extraction is sent automatically; replayed saved imports reuse the saved result and do not produce a new provider-response log.

The root `.env` has an API-key placeholder; no key is embedded in the app. Set your own `OPENAI_API_KEY` and `PRESCRIPTION_EXTRACTION_ENABLED=true` there, then restart the backend. Configure a stable `PRESCRIPTION_ENCRYPTION_KEY` before keeping real prescriptions; see the setup guide for generation and the development-only fallback. The model is fixed to **gpt-4o-mini** and the user's prompt is preserved in `backend/src/main/resources/prescription-prompt.txt`.

Home → **Scan / upload prescription** → select family member → preview → explicitly send for extraction → review each medicine → save draft or preview/confirm schedules. No extraction alone activates alarms. Test fixtures use a mocked provider; no paid calls, SMS or cloud builds were made. New camera/document/image-editing native modules require a new Android build. Keep the backend URL configured separately for the Android build; `localhost` on a phone is not the computer unless USB forwarding is active.

Verification (23 October 2026): **55 backend tests passed with H2**, including authenticated multipart upload, five-medicine extraction, source encryption, PDF retention/rendering, patient access, concurrent activation/retries, duplicate rejection and rollback after a mid-batch failure. **36 mobile business tests passed**, with TypeScript, ESLint and formatting checks passing. Web and Android Hermes bundle exports passed. PostgreSQL verification subsequently passed after Docker recovered and the local port changed to 15432: all 55 backend tests passed against the isolated PostgreSQL 17.11 test database. Live OpenAI accuracy/billing, browser interaction, camera permissions and physical-device alarm delivery remain unverified.

Dependency review reports 22 mobile-tree advisories (19 high, 3 moderate). Suggested major Expo/React Native downgrades conflict with SDK 58 and were not applied; none of the three new scan modules is named as an advisory entry. A compatible dependency remediation review remains a release task. See the setup guide for the unavailable external Indian drug catalog, unsupported irregular regimens and existing device/offline limitations.

## Start the application on this Windows computer

Start Docker Desktop first and wait until its engine is running. The existing local `.env` configuration on this workstation is already set up; keep it and do not overwrite it.

In **PowerShell terminal 1**, start PostgreSQL and the backend:

```powershell
cd E:\dev\med-health-app
docker compose --env-file .env up -d --wait database
.\scripts\Start-Backend.ps1 -JavaHome 'C:\Program Files\Java\jdk-23'
```

Keep terminal 1 open. In **PowerShell terminal 2**, start the web app using the supported Node 24 runtime:

```powershell
cd E:\dev\med-health-app\mobile
$env:PATH='C:\Users\shoye\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
npm run web -- --port 8081
```

Keep terminal 2 open and visit [Family Medicine](http://127.0.0.1:8081/). If the app is already running, use that instance instead of starting another server on the same port.

Optionally, check the backend in another PowerShell terminal:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Run `npm ci` from the mobile folder only for first-time dependency installation or after dependency changes, before starting the web app. It is not required on each startup. After reloading the app, enable reminders and sound again in Settings and use the voice test to check Hindi availability. These startup commands use local services and send no SMS.

To stop the application, press **Ctrl+C** in each server terminal. To stop PostgreSQL without deleting its stored data:

```powershell
cd E:\dev\med-health-app
docker compose stop database
```

Startup verification on 20 October 2026: the web app at port 8081 and the backend `/health` endpoint at port 8080 both returned HTTP 200, and PostgreSQL connected successfully.

## Run the sample app

Use Node 24 LTS (at least 24.3), or another version allowed by `mobile/package.json`. The system Node 25 is outside Expo SDK 58's supported range. A supported Node 24 runtime is also available at `C:\Users\shoye\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` on the current workstation.

```powershell
cd mobile
npm ci
npm run web
# Or: npm run android
```

The opening screen offers sign-in, registration and an explicit **Explore sample data** option. Sample changes reset on reload and are not persisted as health records. No Expo account or backend is needed for sample data. Web development defaults to `http://localhost:8080` for account access; native builds require `EXPO_PUBLIC_API_URL`. Browser reminder sound must be enabled again after each page reload.

## Try medicine reminders

1. Open the app and go to Settings. Select **Enable tab reminders and sound** in the browser, or **Enable reminders on this device** in a native build. The browser immediately plays three beeps. If silent, check Chrome site sound permission, tab mute and speaker volume before relying on timed sound.
2. Select **Test reminder in 5 seconds**. A generic alert should appear. Check sound with your device volume up and the browser tab unmuted. Dismissal does not record a dose.
3. Save a reviewed schedule with a future time. Settings shows the number registered and the next due time, interpreted in Asia/Kolkata. Taken/Skipped cancels that occurrence's future registration.

The browser uses active-page timers and a short repeating tone, capped at 30 seconds. Keep the tab open and the computer awake. Reloading resets sample schedules and disables browser sound until another explicit enable action. Closed, sleeping or suspended tabs cannot provide reliable timed alarms. Optional desktop notifications require a separate permission action; the in-app alert does not depend on that permission. Do not expect a missed 5:30 PM alert to replay when you enable reminders later.

Native code uses `expo-notifications` and schedules one-off OS notifications from accepted occurrence instants. It requests notification permission and Android Alarms & reminders access before registering time-sensitive alarms. Generic notification content does not include member or medicine names. The opt-in preference is stored with SecureStore; this does not implement encrypted offline health-record storage. Existing native registrations are left in place if a fresh app session cannot fetch a confirmed plan. Permission changes are checked when the app resumes.

An Android development build is required to validate the configured native permissions and notification channel (`npx expo run:android` on a machine with the required Android SDK, or the normal EAS development-build workflow). A web bundle or Hermes export is not an installed Android app. No Android phone/emulator was connected during this implementation, so native presentation, reboot, app termination, battery restrictions and iOS behavior remain device release gates. Do not claim guaranteed alarm delivery.

Registrations use stable occurrence IDs, a seven-day target and a conservative app budget of 60 pending notifications, with four slots reserved and existing registrations counted. This budget is not a claim about the platform's actual maximum. The registry reports actual installed entries, next time, last scheduled entry and omitted count. Earliest reminders across members are selected first. Disable cancels this feature's dose and test registrations without touching unrelated notifications. Conflicting schedule times fail visibly, and delayed browser alerts older than one minute are discarded instead of replaying a backlog.

This remains a single-device development setup. Server-enforced primary recipient/device assignment, transfer, snooze and remote edit/revocation propagation still need implementation. Avoid enabling the same member's routine alerts on several devices until routing is implemented.

## Run the PostgreSQL backend

Requires Java 17 or newer, Maven and a running Docker engine (or your own PostgreSQL database). Java 23 is installed on this workstation; set JAVA_HOME to the intended JDK if Maven chooses an older installation.

Local credentials are stored in the gitignored root `.env`. On a new checkout, copy `.env.example` to `.env` and replace both placeholder credentials with random local values. Keep the existing generated `.env` on this workstation. The current local host port is 15432. Windows reserved the previous port 55432 (within 55415–55514), so it was changed in the root `.env`; PostgreSQL still uses 5432 inside its container. Startup and test scripts read the configured port automatically.

From the repository root, start the database and API:

```powershell
docker compose --env-file .env up -d --wait database
.\scripts\Start-Backend.ps1 -JavaHome 'C:\Program Files\Java\jdk-23'
```

The startup script loads local settings and selects the PostgreSQL application database. For a manual launch, use the same settings in the terminal running the backend:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-23'
$env:SPRING_PROFILES_ACTIVE='dev'
$env:DATABASE_URL='jdbc:postgresql://localhost:15432/family_medicine'
$env:DATABASE_PASSWORD='<same-local-database-password>'
$env:DEV_API_TOKEN='<local-development-token-at-least-24-characters>'
cd backend
mvn spring-boot:run
```

The server binds to `127.0.0.1:8080` by default. The health route is `/health`. Account registration and sign-in endpoints are public; medicine records and session information require authentication. Account sessions identify distinct owners. The local developer bearer token remains restricted to dev/test profiles for developer tools and is not used by the app sign-in flow.

Copy `mobile/.env.example` to `mobile/.env.local` and set `EXPO_PUBLIC_API_URL=http://localhost:8080`. Restart Expo. For the Android emulator, use `http://10.0.2.2:8080`. A physical Android phone needs your computer's trusted LAN IP and `SERVER_ADDRESS=0.0.0.0` on the backend. Keep development access on a trusted network; use HTTPS for deployed authentication. No client developer token is needed.

Public Expo environment values are embedded in the app. Never place real credentials in them. Use fictional data for this preview.

## Checks

```powershell
cd mobile
npm run typecheck
npm run lint
npm run format:check
npm test
npx expo export --platform web --output-dir dist-web
npx expo export --platform android --output-dir dist-android
```

```powershell
cd backend
mvn test
```

By default, backend tests use H2 in PostgreSQL compatibility mode and a fixed clock. Run the PostgreSQL command below to check the same service transactions and migration on the real database. Native device tests remain required. No Android APK or physical-device notification behavior is validated by JavaScript bundle export.

To run the same suite against real PostgreSQL, from the repository root:

```powershell
.\scripts\Test-Postgres.ps1 -JavaHome 'C:\Program Files\Java\jdk-23'
```

This command starts/checks the container, creates `family_medicine_test` if needed, and supplies its connection details only to the test process. It does not write test fixtures into `family_medicine`. Shell environment values override `.env`, matching Docker Compose. Credentials are never printed. The default `mvn test` still uses H2 unless `TEST_DATABASE_URL`, `TEST_DATABASE_USER` and `TEST_DATABASE_PASSWORD` are set.

Current verification: on 19 October 2026, all 18 backend tests passed with PostgreSQL 17.11, including concurrent retries, HTTP authentication/validation, access isolation, inclusive dates and DST behavior. Flyway applied the schema successfully to the isolated PostgreSQL test database. The suite previously passed with H2 as well. Mobile lint/type checks and web/Android bundle exports passed in the previous implementation slice. Browser checks cover Taken with a single stock deduction, mandatory schedule review, saving a reviewed schedule, adding a family member and a 360-pixel layout without horizontal overflow. Native device tests remain pending.

Reminder verification adds 12 automated tests for eligibility, duplicate prevention, scheduling budget, actual coverage, Taken cancellation, obsolete registrations, permission revocation, serialized disable and no overdue replay. The browser five-second test displayed the generic alert. A reviewed fictional schedule for 9 PM also produced its timed dose alert; dismissal left the dose unrecorded, and turning reminders off cancelled the remaining registrations. Sound initialization was verified as running in the browser; audible output and native-device delivery still need user/device confirmation. Final mobile lint, type and formatting checks pass, as do web and Android Hermes bundle exports. These exports do not validate a native APK or device presentation.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /health | Process health |
| GET / POST | /v1/members | List/create owned managed profiles |
| GET | /v1/schedules | List owned schedules and estimated stock |
| POST | /v1/schedules/preview | Validate and preview reviewed instructions |
| POST | /v1/schedules | Activate with UUID Idempotency-Key header |
| GET | /v1/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Asia/Kolkata | Authorized occurrence range, maximum 90 days |
| POST | /v1/dose-events | Record an event with a unique eventId |

## Important implementation boundaries

Chrome Hindi speech diagnostics (20 October 2026): Settings now shows the selected local voice and available local voice languages, plus a direct-click speech test. Voice-list changes and asynchronous speech errors update the UI immediately; blocked playback includes an actionable message. The browser resumes paused synthesis and normalizes locale separators. Missing Hindi still falls back to tone/visual delivery without selecting a remote voice. Standard Windows Speech/OneCore voice registrations on this workstation contained no Hindi voice when checked; actual Chrome voice exposure and audible speech require confirmation after installing a supported Hindi voice. All 29 mobile tests, TypeScript, ESLint and formatting checks pass. No paid speech service or system modification was performed.

Empty-family navigation fix (20 October 2026): Home shows Add member first for a successfully loaded empty family and opens Family with its form expanded. Direct medicine URLs redirect there too; loading/network failure is handled separately and does not assume there are no members. Existing members retain the normal medicine flow, and closing/saving clears the form-opening route flag. All 29 mobile business tests pass; TypeScript, lint and formatting checks pass. Browser visual confirmation remains open. No backend or native changes were needed.

Add Medicine usability fix (20 October 2026): Preview is disabled only during a request; validation messages now appear beside it, and unavailable/stale member IDs are checked explicitly. Composition, form, route, strength and meal fields are grouped under optional prescription details; stock tracking and weekday controls are collapsed. Hidden values are preserved. Blank optional form/route/meal metadata is recorded as `Not entered`, without inferring a prescription instruction. Numeric amount guidance now clearly separates `1` from the `tablet` unit. All 29 mobile tests, TypeScript, ESLint and formatting checks pass. This UI-only change does not alter backend stock, dose or scheduling rules. Visual/device confirmation remains open.

Hindi alarm verification (20 October 2026): Settings now has a saved Hindi/English speech preference. Message generation, browser voice selection, native foreground speech and encrypted Android background registrations use the selected language. All 29 mobile tests pass, including missing Hindi voice fallback and unchanged occurrence IDs/times. Mobile lint/type/format checks pass. The updated Kotlin module compiles and native unit tests pass in offline Gradle validation with installed NDK 28.2; no APK was built or installed. An updated Android build and physical Hindi voice/locked-screen tests remain required. See [Hindi alarm setup](deliverables/Hindi_Spoken_Alarms.md). No paid speech provider or cloud build was used.

Low-stock verification (20 October 2026): 39 PostgreSQL backend tests and 28 mobile tests pass. Coverage includes exact API payloads, positive/zero thresholds, disabling, access denial, valid Taken outcomes, idempotent retries, Skip and notification episode deduplication. Mobile TypeScript, ESLint, formatting and Android Hermes export pass. Migration V6 applied and the updated API is running on port 8080. Native/browser notification presentation still needs device confirmation. Alerts evaluate confirmed stock loaded by the running app; closed-app push delivery, persistent cross-restart deduplication and refill/correction workflows are not implemented. No SMS, new package or paid build was used.

Add Medicine verification (20 October 2026): all 36 backend tests pass against PostgreSQL 17.11. New coverage checks the exact HTTP payload and persisted structured fields, liquid strength versus amount, stock deduction/idempotency, frequency/time mismatch, explicit unknown amount and rejection of variable/as-needed regimens. All 25 mobile tests, TypeScript, ESLint and formatting checks pass. Migration V5 applied and the updated backend is running on port 8080. Browser visual and physical-device confirmation remain open. No packages, SMS or paid builds were added. This is prescription data entry, not clinical validation or a complete prescription workflow.

Family invitation rendering fix (20 October 2026): empty error/notice strings now render `null`, preventing bare text children inside the panel's React Native View. TypeScript, ESLint, formatting for the changed file and all 23 mobile tests pass. Browser visual confirmation remains open; these tests do not mount the invitation screen.

Family-access verification (20 October 2026): all 31 backend tests pass with PostgreSQL 17.11, including profile-scoped schedule/dose access, rejection before both approvals, expiry, decline, audit records, revocation and exclusion of unverified development identities outside development. All 23 mobile tests, TypeScript, ESLint and formatting checks pass. Backend migrations V3/V4 applied successfully and the restarted API is healthy on port 8080. No packages, SMS charges or cloud builds were added. Browser visual/device checks remain open; remote cancellation of previously scheduled alarms still requires a successful device refresh. This is managed-profile sharing, not completed independent-adult transitions or granular grants.

Authentication verification (20 October 2026): all 28 backend tests pass with H2, including ten account tests covering hashed credentials, registration/login/logout, session expiry, account isolation, OTP replay/expiry, attempt limits, disabled real SMS and rejection of development codes for verified phone accounts. All 23 mobile tests, lint, TypeScript, formatting, web export and Android Hermes export pass. Development/test profiles send no SMS. All 28 tests also pass against PostgreSQL 17.11, including the account migration. The development backend is running on port 8080. Browser visual inspection was blocked by the browser tool's security policy. Physical Android validation remains open. See the account setup guide for details.

The current app is an online development slice, with an in-memory UI demonstration mode. The following requirements remain pending:

- Email ownership verification, real SMS provider activation/device verification, account recovery, independent-adult transitions and granular member permissions. Email/password sessions and bounded development OTP flows are implemented; development phone codes do not prove number ownership. Managed-profile sharing supports explicit invitation, recipient acceptance and final owner approval.
- Prescription upload/extraction and mandatory source review, immutable instruction editing, pause/resume, duplicate-medicine review and PRN flows.
- Native physical-device validation, server-enforced designated device transfer, snooze and background coverage replenishment. Local adapters, permission setup and foreground reconciliation are implemented.
- Encrypted offline database, durable outbound queue, change cursors/tombstones, retry/backoff, preserved conflicting submissions and conflict-resolution UI.
- Dose corrections and a full stock ledger with refills and reversals. Low-stock warnings/local notifications are implemented for confirmed stock loaded by the running app; closed-app push monitoring remains pending. Current stock effects are stored with accepted dose events; negative estimates are allowed and flagged for review.
- Export, deletion/retention workflows, production hosting and operational controls.

Conflicting online dose actions currently return 409 without overwriting the accepted action or making another deduction. They do not yet persist both conflicting submissions. A failed mobile action keeps its event ID only while the app process stays open; this is not a durable offline queue. Repeating a matching action returns the existing effective result. Schedule activation materializes up to 35 days; automatic horizon replenishment is pending. The form currently uses Asia/Kolkata; the backend planner supports named zones.

The mobile dependency audit reports inherited upstream advisories, including transitive development/build dependencies. Review them before release; do not use `npm audit fix --force` to downgrade Expo/React Native to incompatible versions. The installed dependency set is pinned by `package-lock.json`.

## Structure

```text
mobile/src/app/          Expo Router screens and layouts
mobile/src/components/   Accessible reusable UI
mobile/src/domain/       Types and date/status helpers
mobile/src/data/         HTTP and sample-data adapters
mobile/src/state/        App data loading and action state
mobile/src/reminders/    Platform adapters, reconciliation, permission/readiness UI
mobile/tests/            Reminder business-rule and coordinator tests
backend/src/main/java/   API contracts, domain services and security boundary
backend/src/main/resources/db/migration/  Versioned SQL schema
backend/src/test/        Recurrence, isolation, transaction and HTTP tests
deliverables/            Requirements-derived technical document and authoring scripts
```

Follow `CONTRIBUTING.md` and `mobile/AGENTS.md`. Next steps are verified identity/member consent, immutable schedule edits and the native-notification feasibility gate before real pilot use. The browser sample-data preview remains separate from the running API until its Expo API environment settings are configured and the bundle is rebuilt.

Reminder fix verification (19 October 2026): 16 automated tests pass, including preservation of an existing alert during a refresh at its due instant, no recreation after dispatch, and visible browser delivery despite audio failure. The browser enable action now plays an immediate sound check; Settings shows audio errors and the last triggered alert. Physical speaker output and the user's separate Chrome session remain unverified.

Spoken browser reminders (19 October 2026): due alerts now say the exact occurrence's medicine and member name, for example: It is time for DOLO. Mohammad Ahmad, please take your medicine. The five-second test labels this example as a test. Speech uses an installed local device voice, queues simultaneous reminders, pauses repeating beeps while speaking, and stops on dismissal, disable or disposal. Desktop notification content remains generic. Missing speech support or installed voices leaves the tone and visible alert available; Recheck reminder readiness displays speech errors. Native OS notification speech is not implemented. All 17 reminder tests, TypeScript and lint checks pass; physical voice playback still needs Chrome/device confirmation.

Spoken repetition fix: successful browser speech now repeats after a pause of at least five seconds during the same 30-second alarm, instead of reverting to generic beeps. Speech batches do not overlap; dismissal, disable and the alarm deadline cancel repetitions. Generic tone remains a fallback for unavailable or failed speech. Regression checks cover repetition, no overlap and dismissal; all 17 reminder tests pass.

Native foreground speech (19 October 2026): SDK-compatible expo-speech now speaks the exact due occurrence's medicine and member name while the app is active, using the shared occurrence lookup. The five-second native test speaks the fictional DOLO/Mohammad Ahmad example. Repeats wait five seconds after completion, do not overlap, and stop on dismissal, disable, backgrounding, disposal or the 30-second deadline. Stale background notifications are not replayed as speech on resume. Names remain out of scheduled notification payloads; Android uses its configured TTS engine, so speech privacy/voice availability also depends on device settings. Background, locked-screen and terminated-app speech require additional native Android work and are NOT implemented. Existing OS notification tones remain independent. The project remains SDK 58; SDK 57 Expo Go cannot open it. A compatible development build and physical-device validation are still required. All 18 reminder tests pass, including native repeat/cancel/deadline/error handling; no physical device speech result is claimed.

Android locked-screen/closed-app implementation: a local Expo module now registers exact AlarmManager alarms and starts a bounded native TTS foreground service without JavaScript. Queued speech is encrypted with Android Keystore AES-GCM outside backups; offline English voice selection, generic lock-screen notification/Dismiss, audio focus, wake lock, tone fallback, stale-token checks, cancellation and future-only reboot restoration are implemented. Force Stop still blocks delivery until the app is reopened. Expo Go cannot run this module; use an installed build, with the new eas.json preview APK profile. iOS remains foreground speech only. See deliverables/Android_Spoken_Alarm_Verification.md for build instructions and mandatory physical-device checks. Earlier foreground-only status entries describe previous implementation slices. Native compilation/device results must be recorded separately; JavaScript checks alone do not establish background delivery.

Background alarm automated verification: all 19 reminder tests, TypeScript, ESLint and Android Hermes export pass. The new Kotlin module compiles, and its native JUnit stale-delivery boundary test passes (Gradle BUILD SUCCESSFUL). Local Kotlin validation used installed NDK 28.2 through scripts/local-native-validation.gradle after the default NDK download stalled; EAS configuration retains the normal Expo toolchain. These checks did not assemble/install an APK or validate physical locked-screen audio. The native device release gate remains open.

### Add medicine date and time controls (2026-10-20)

The add-medicine form now provides an expandable calendar for the confirmed start and inclusive end dates, plus separate hour, minute and AM/PM controls for each reminder. Use Add another reminder time for multiple daily reminders. Neither opening the calendar nor adding a reminder row assumes a treatment date/time. Closing a calendar preserves the previous selection. Changing a selection clears the prescription-review acknowledgement. Preview times use AM/PM; requests retain ISO calendar dates and canonical 24-hour times, so backend contracts and timezone rules are unchanged.

These controls use the existing React Native components on web and mobile, with no new dependencies, native rebuild or paid service. Verification: mobile TypeScript and ESLint passed; all 32 mobile business tests passed, including midnight/noon conversion, incomplete-time rejection, leap years and calendar year rollover. Browser visual interaction and physical-device interaction have not been verified for this change. No backend code changed.


Database port check (23 October 2026): Windows reported 55432 inside an excluded TCP range; a loopback bind test passed on 15432. Updated the local .env and example. Docker Compose restart remained blocked by an engine Internal Server Error; no database volume was deleted.


Recovery verification (23 October 2026): PostgreSQL is healthy on localhost:15432 and the backend /health returned HTTP 200. All 55 backend tests passed on PostgreSQL 17.11, with zero failures/errors/skips and mocked extraction only; no OpenAI charges were incurred by testing.


Response-logging verification (23 October 2026): all 58 backend tests passed against isolated PostgreSQL, including development-only opt-in, credential/image redaction, control-character escaping and bounded logging. Mobile type checking and ESLint passed. Tests used mocked extraction only; no live OpenAI call was made.


Extraction-quality verification: all 60 backend tests passed against isolated PostgreSQL, including ordered image/page request construction and forced uncertainty for incomplete model output. Mobile TypeScript and ESLint passed. Synthetic fixtures were used, with no real API call and no patient prescription committed as a regression fixture.


Prescription preview feedback (23 October 2026): the screen now shows reviewed/new medicine counts and actionable errors next to Save and preview reviewed schedules. A client preflight prevents saving/calling preview when no new medicine has both an explicit user review and a reviewed schedule; saved drafts and previously activated plans are not silently promoted. The backend review requirement remains unchanged. All 37 mobile business tests, TypeScript and ESLint passed. No backend change or live extraction call was needed; browser/device interaction remains unverified for this adjustment.

Prescription error display (23 October 2026): upload/extraction, medicine-card validation, crop controls, routine validation and screen/API errors use a shared red error panel with screen-reader alert announcements. Schedule-preview errors are also shown beside the preview action. Errors persist until the next edit or action and do not discard entered form data. This is a presentation change; backend validation is unchanged.
Error-display verification: all 37 mobile business tests, TypeScript and ESLint passed. Visual browser/device verification remains pending.

Required field indicators (23 October 2026): shared field, dropdown, medicine-name, calendar and reminder-time controls support a red asterisk and accessible required labels. Manual medicine and prescription review forms mark required inputs; quantity follows the amount-unspecified option, end date is marked only when needed, and uncertainty confirmation is required only for unclear extraction. Patient routine time overrides remain optional; their timezone is required. Extraction drafts can still be saved unresolved. All 37 mobile business tests passed; TypeScript and ESLint passed for the main indicator change. No clinical validation rules were changed.

Manual preview validation (23 October 2026): a blank form now shows a red, accessible list of missing mandatory fields before unsupported-regimen checks. An empty plan selection is no longer described as an as-needed/tapering plan. Unknown-amount and no-end-date acknowledgements control their respective required fields; unsupported plans remain blocked once required inputs are supplied. Validation stops before any preview API call and retains the form values.
Manual-validation verification: all 39 mobile tests, TypeScript, ESLint and changed-file formatting checks passed. No backend validation or clinical scheduling rules changed; browser/device interaction remains unverified.

Mock-mode verification (23 October 2026): all 63 backend tests passed against isolated PostgreSQL, including exact fixture JSON, zero calls to the live provider, production-profile exclusion, and retained mock labels for prescriptions and activated schedules/doses. All 39 mobile business tests, TypeScript and ESLint passed. No real API request was used. The local backend was restarted to apply mock mode; uploaded files still use normal local validation/storage, not OpenAI.

Digital time picker (23 October 2026): manual medicine entry, prescription review and patient routines now share the selected option-3 design. Select/Edit time opens a teal modal with large numeric hour/minute tiles, independent up/down controls, AM/PM segments, direct keyboard entry, Confirm, Cancel and an explicit clear action for an existing selection. No time/period is selected automatically; invalid confirmation shows an error. Cancel/Back does not call the change handler; only confirmed/cleared values invalidate prior prescription review. Canonical 24-hour storage and AM/PM conversion are unchanged. The modal scrolls on smaller screens and accommodates mobile keyboard input. No new dependency or native module was added. All 41 mobile business tests, TypeScript and ESLint passed, including column rollover, blank inputs and unchanged period selection. Browser/device visual interaction remains unverified; no backend code changed.

Inline time-picker correction (23 October 2026): replaced the modal with a compact digital picker directly in each time row, capped at 380 px width. Hour/minute typing, up/down buttons and AM/PM segments are always visible; no popup, overlay or separate time-confirmation step remains. Changes update the form directly and clear prior prescription review through the existing change handlers. Existing time conversion, required-field checks and blank-value behaviour are preserved. One-digit typed values normalize on leaving the field; invalid ranges show a red error. Applies to manual entry, prescription review and patient routines. No backend/API or native-module changes were made.
Inline-picker verification: all 41 mobile business tests, TypeScript and ESLint passed. Browser/device visual interaction remains unverified.

Scroll-wheel time picker (23 October 2026): replaced the inline digital arrows with three scrollable hour, minute and AM/PM columns matching the user's reference. The center row is highlighted; users can scroll or tap a value. Blank selections remain explicit, no prescription time is preselected, and Clear time remains available. Uses existing React Native components without additional packages; form review invalidation and canonical time validation remain unchanged. Verification: all 41 mobile business tests, TypeScript, ESLint and component formatting passed. Browser/device scrolling and visual interaction remain unverified. No backend changes or paid services used.

Plan navigation and account controls (23 October 2026): Back to your plan on manual medicine and prescription pages now replaces the current route with Home, so direct links/reloads do not dispatch GO_BACK without navigation history. Shared page headers expose Settings and Log out (Sign in in sample mode). Logout uses the existing account logout path, reminder cleanup and protected session clearing; pending dose changes still block logout and show an accessible red error. No backend/authentication policy changes. Verification: 41 mobile business tests, TypeScript, ESLint and changed-file formatting passed. Browser/device interaction remains unverified.

Prescription frequency guidance (23 October 2026): replaced the ambiguous fixed-daily error with accepted dose-count examples and added guidance beside Frequency as written. Daily and confirmed fixed daily are not silently interpreted as once daily; extraction evidence and server validation are preserved. All 41 mobile business tests passed; TypeScript, ESLint and formatting passed before the final helper-text addition, with final checks repeated. No backend changes; UI interaction unverified.

Dose-unit dropdown (23 October 2026): manual medicine entry and prescription review share a required dropdown for tablet, capsule, mL, drop, puff, spray, sachet, patch, mg, g and unit. Other unit allows the prescribed unit to be entered without converting or replacing existing custom values. Changes retain review invalidation; stock units are not converted. Verification: all 41 mobile business tests, TypeScript, ESLint and changed-file formatting passed. Browser/device interaction remains unverified; no backend changes.

Login keyboard and refresh persistence (23 October 2026): Enter in email/password/confirmation submits through the same credential action as the button, with a synchronous guard against duplicate in-flight requests. Web credentials now use tab-scoped browser sessionStorage instead of a no-op memory adapter, allowing refresh restoration through the existing expiry and /me checks. Passwords are not stored. Logout and invalidation remove the saved session; native SecureStore is unchanged. This is browser-readable bearer storage, not an HttpOnly-cookie production session; browser storage must be available and the same origin must be used. It does not implement encrypted offline medical records. Verification: all 43 mobile business tests passed, including session read/write/clear isolation and server-render safety; TypeScript, ESLint and formatting passed. Actual browser refresh/keyboard interaction remains unverified. No backend changes.

Compact prescription history (23 October 2026): selected-member history now shows five compact rows per page, newest first with upload date/time, current medicine count, readable review/schedule labels, Test data provenance and an Open action. All, Review needed and With schedules filters retain partially scheduled prescriptions in both relevant filters. Existing family-member selector scopes history; a labeled refresh icon replaces the full-width button. Pagination/filtering are client-side over the existing authorized history response, not backend pagination; With schedules indicates linked plans, not proof they remain active. Verification: all 44 mobile business tests, TypeScript, ESLint and changed-file formatting passed, including history sorting and partial-review filtering. Browser/device visual interaction remains unverified. No backend changes.

Prescription member-selection correction (23 October 2026): routine, upload and history sibling components now use distinct role-prefixed member keys. This fixes the duplicate React key introduced by the history component while retaining per-member state resets. Verification: all 44 mobile business tests, TypeScript, ESLint and changed-file formatting passed. Actual browser interaction remains unverified; no backend changes.
