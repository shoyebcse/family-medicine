# Prescription scan and extraction

Implementation follows `Medicine_Scheduler_Prescription_Feature_Spec.docx` version 1.0, with the user's later choice of **OpenAI `gpt-4o-mini`** and exact extraction prompt taking precedence over unspecified provider choices. The model name is fixed in the backend adapter. The prompt is versioned in `backend/src/main/resources/prescription-prompt.txt`.

## Configure the private backend

The root `.env` and `.env.example` have placeholders. Replace only the placeholder in your private root `.env`:

```dotenv
OPENAI_API_KEY=REPLACE_WITH_YOUR_OPENAI_API_KEY
PRESCRIPTION_EXTRACTION_ENABLED=true
PRESCRIPTION_ENCRYPTION_KEY=REPLACE_WITH_BASE64_32_BYTE_KEY
```

Never put the key in an `EXPO_PUBLIC_*` variable or the app build. `Start-Backend.ps1` reads these values without printing them. Restart the backend after configuration. Placeholder keys or disabled extraction cannot make OpenAI requests. The UI reports configuration readiness; it does not verify provider account credits.

For a dedicated storage key, generate 32 random bytes encoded as base64, for example locally with Node:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Keep the encryption key stable and backed up. Changing it prevents reading existing prescriptions. In dev/test only, an unconfigured key is derived from the existing development token so local setup works; changing that token also changes the fallback encryption key. A production profile requires the dedicated encryption key for prescription storage. Configure it **before** retaining real health information.

Sources, original uploaded files, extracted JSON, draft review fields, routine settings and prescription audit snapshots are encrypted with AES-256-GCM and context-bound authentication. The existing schedules use the application's existing database representation. Browser responses are `no-store`; no new offline persistence is enabled. Production deployment still requires HTTPS, managed key handling, protected backups, retention/deletion policies and device verification. Images selected/captured on native devices use the platform's app cache while editing; an app-managed encrypted offline image cache is not implemented.

Real extraction calls may incur OpenAI charges. A user starts one by selecting **Send to OpenAI and extract all medicines** after previewing pages. Preview, manual editing, routine settings and automated tests do not call OpenAI. No automatic provider retries occur. For connection loss, check history first. If the request completed and saved, retrying the same key/content reuses the saved prescription; if a charge occurred before the result could be persisted, another explicit retry can incur a further charge.

For local debugging, set `OPENAI_LOG_RESPONSES=true` in the root `.env`, restart the backend, and make an explicitly requested extraction from the UI. Look in the backend terminal for `OpenAI extraction RAW_RESPONSE`, `httpStatus`, `requestId`, and `parsed medicines`. Successful and provider-error response bodies are captured; truncated, incomplete or invalid output also produces a rejection code. Bodies are bounded/escaped and key/image-data patterns are redacted. This is opt-in and only active in the `dev` profile. Prescription/patient information may remain in raw text: keep the terminal/log files private and turn the flag off after diagnosis. No request body or Authorization header is logged. A repeated import served from the saved database result does not contact OpenAI again and therefore emits no new provider response.

## Use the feature

1. Sign in, then choose **Scan / upload prescription** on Home.
2. Select the correct family member. A detected patient name does not select or create a member.
3. Capture a photo or choose JPG, PNG or PDF files. Default limits are 8 pages and 10 MB combined per set. File signatures, image dimensions and PDF page bounds are checked on the server, not just extensions.
4. Preview all pages, reorder, rotate, crop or retake as needed. For PDFs, choose **Edit PDF pages individually** to render editable images. Preview again after edits. Original selected files are archived separately, including original pages excluded from extraction, with an explicit notice before submission.
5. Send to OpenAI. Every detected medicine gets an independent editable draft card. Unreadable values remain unresolved; strength never populates the dose amount.
6. Compare against **View original prescription pages**. Correct names, strength, dose, frequency, timing and duration; remove false positives or add missed entries. Record how unclear instructions were confirmed.
7. Enter the confirmed numeric dose/unit, full instructions, calendar dates and AM/PM reminder times. The review card reuses the manual workflow's fields, date/time controls and prescription validation. Stock remains opt-in through the existing medicine workflow; extraction never infers stock.
8. Save unresolved entries with **Save as draft — no alarms**. Review each completed medicine, then choose **Save and preview reviewed schedules**.
9. Confirm the preview to activate the reviewed entries together. Unreviewed medicines stay drafts. If any selected entry fails validation or activation, no selected entry is committed.
10. Return to **My prescriptions** for original pages, extracted medicines and linked plans. Linked entries show ACTIVE, COMPLETED or DISCONTINUED. Discontinue a plan to remove its future unrecorded occurrences on the next device refresh. Already registered offline-device alarms cannot be remotely cancelled until that device reconnects/refreshes.

Navigating away before saving loses unsaved in-memory edits; the UI labels unsaved changes and provides an explicit saved-version reload action. Persisted drafts survive reload through PostgreSQL.

## Routine examples

Each member has independent partial routine overrides and a named timezone. Application defaults are wake-up 07:00, breakfast 09:00, lunch 13:30, dinner 20:30, bedtime 22:30.

- A reviewed medicine explicitly says `08:15`: the draft uses 08:15 even if breakfast is 09:00.
- Patient A's breakfast is 08:00; a reviewed morning timing proposes 08:00 and identifies it as a patient routine value.
- Patient B has no breakfast preference: the same timing proposes 09:00 with **Using default breakfast time: 9:00 AM**.
- Only lunch is customized: other missing activities retain their individual default suggestions; saved values are not replaced by defaults.
- A supported reviewed daily pattern such as `1-0-1` can propose breakfast/dinner routine anchors, with an explicit pattern-source notice. It does not infer numeric dose or unit.
- `AC`, `PC`, before/after-food intervals, mixed exact/relative timing and hourly spacing require manually confirmed clock times; an activity anchor cannot establish the needed interval.
- Missing medicine, dose, frequency or duration cannot produce automatic suggestions. SOS, tapering, variable-dose and non-daily instructions remain drafts. Fixed daily imports recognize OD, BD, TDS, QID and HS for count validation while preserving the original extraction.

Changing a draft invalidates that medicine's review and clears the batch preview. Routine changes invalidate unsaved imported reviews but never edit active schedules; users must separately review any affected active plan and discontinue/re-enter it where appropriate.

## API and persistence

All routes require the existing bearer session. Patient authorization uses the same owner/accepted-family access rules as manual medicines, including source reads and routines.

| Route | Purpose |
| --- | --- |
| `GET /v1/prescriptions/options` | Readiness, model and configured upload limits; no secret values |
| `POST /v1/prescriptions/preview-files` | Multipart `memberId` + `files`; local image/PDF preview, no AI |
| `POST /v1/prescriptions/extract` | Multipart `memberId`, `files`, optional unmodified `originals`, UUID `Idempotency-Key` |
| `GET /v1/members/{id}/prescriptions` | Patient history (latest 100) |
| `GET /v1/prescriptions/{id}` | Protected extraction and current draft |
| `GET /v1/prescriptions/{id}/original-pages` | Original-file image previews |
| `GET /v1/prescriptions/{id}/originals/{index}` | Protected original-file download |
| `POST /v1/prescriptions/{id}/draft` | Save unresolved/reviewed entries with expected version |
| `POST /v1/prescriptions/{id}/schedule-preview` | Validate reviewed entries without activation |
| `POST /v1/prescriptions/{id}/activate` | Expected version and selected item IDs; transactional activation |
| `GET /v1/prescriptions/{id}/plan-states` | Active/completed/discontinued linked states |
| `POST /v1/prescriptions/{id}/items/{item}/discontinue` | Stop a linked plan, preserving evidence/history |
| `GET /v1/prescriptions/{id}/audit` | Confirmation/edit action metadata; encrypted snapshots retained server-side |
| `GET/POST /v1/members/{id}/routine` | Read/save partial patient routine |

Migration V7 adds prescription, original/source, audit, routine and plan-link tables plus schedule discontinuation. Stale draft mutations return 409 with current-version metadata, requiring reload/review; they do not silently overwrite edits. Stable prescription item IDs and deterministic schedule command IDs prevent double activation. Exact duplicate medicine/time/date entries are rejected for explicit review rather than merged. Extraction uses strict structured JSON and rejects incomplete, refused or malformed provider output. Uploaded text/images are untrusted evidence, not executable instructions.

Backend limits: `PRESCRIPTION_MAX_BYTES` and `PRESCRIPTION_MAX_PAGES` can lower the defaults; Spring's multipart limits cap each file at 10 MB and the full request at 21 MB to accommodate originals plus edited sources. The mobile UI currently caps a set at the default 8 files/10 MB even if server limits are raised. Malformed or password-protected PDFs are rejected. Apache PDFBox renders bounded pages locally so `gpt-4o-mini` receives images, including scanned PDFs.

## Requirements coverage and remaining release work

| ID | Implementation / limitation |
| --- | --- |
| FR-01 | Camera/file selection, ordered multi-page image/PDF preview, crop/rotate/retake/remove, signature/size checks and encrypted originals. Native permissions and physical-device flow still need verification. |
| FR-02 | `gpt-4o-mini`, user's exact JSON/prompt, all medicine entries, raw text and uncertainty. Clinic/form are not added to the user's narrower JSON schema. No external drug catalog was provided: autocomplete suggests only previously recorded authorized brand/generic names, explicitly labelled as unverified historical entries. A licensed Indian medicine catalog/fuzzy candidate service remains an integration decision, not a claimed feature. |
| FR-03 | Editable/add/remove cards, unresolved drafts, per-medicine review, shared validation, version conflicts, atomic batch activation and retry/duplicate protection. |
| FR-04 | Patient routines, partial defaults, source messages, explicit-time priority and review before activation. Before/after-meal intervals, irregular courses and changing doses remain manual/unresolved rather than guessed. |
| FR-05 | Patient-scoped history, encrypted source access, linked statuses, versioned audit snapshots and existing consented family authorization. |
| FR-06 | Uses existing durable schedules and device reconciliation; discontinuation excludes future pending doses. Existing offline-device, permission, closed-app, device-assignment and physical-device validation limitations still apply. |

The implementation is not a production release gate. No live provider accuracy or billing test has been performed with a real key. No paid test call, SMS or cloud APK build was started. A new Android build is needed for the newly added camera/document/image-editing modules. Web/Android bundle generation does not prove camera permissions, browser file-dialog behaviour or actual-device alarm delivery.

Verification completed 23 October 2026: all **55 backend tests** passed against H2, including actual authenticated multipart HTTP upload with a mocked extraction provider, five-item batch activation, concurrency, mid-batch transactional rollback, encrypted originals, PDF rendering, partial routines and patient isolation. All **36 mobile business tests**, TypeScript, ESLint, formatting and web/Android Hermes bundle exports passed. After Docker recovered and the configured port moved to 15432, all 55 backend tests also passed against the isolated PostgreSQL 17.11 test database (zero failures/errors/skips). The backend health endpoint returned HTTP 200. Dependency audit reported 19 high and 3 moderate advisories in the current Expo/React Native tree; incompatible major downgrades suggested by npm were not applied.

API implementation references: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini).

