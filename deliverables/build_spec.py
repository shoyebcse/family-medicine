from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

OUT=Path(__file__).parent
d=Document()
s=d.sections[0]; s.top_margin=s.bottom_margin=Inches(.7); s.left_margin=s.right_margin=Inches(.8)
s.page_width=Inches(8.27); s.page_height=Inches(11.69)
for n in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
 st=d.styles[n]; st.font.name='Calibri'; st.font.color.rgb=RGBColor(0,0,0)
d.styles['Normal'].font.size=Pt(10)
d.styles['Normal'].paragraph_format.space_after=Pt(6)
d.styles['Normal'].paragraph_format.line_spacing=1.08
d.styles['Title'].font.size=Pt(26)
d.styles['Heading 1'].font.size=Pt(17)
d.styles['Heading 2'].font.size=Pt(12)
def p(t): d.add_paragraph(t)
def h(t): d.add_heading(t,2)
def page(t):
 if len(d.paragraphs)>0: d.add_page_break()
 d.add_heading(t,1)
def table(headers,rows,widths):
 t=d.add_table(rows=1, cols=len(headers)); t.autofit=False
 for c,w in zip(t.columns,widths): c.width=Inches(w)
 for c,v in zip(t.rows[0].cells,headers): c.text=v
 for row in rows:
  for c,v in zip(t.add_row().cells,row): c.text=v
 for i,row in enumerate(t.rows):
  pr=row._tr.get_or_add_trPr(); ns=OxmlElement('w:cantSplit'); pr.append(ns)
  if i==0: pr.append(OxmlElement('w:tblHeader'))
  for j,c in enumerate(row.cells):
   c.width=Inches(widths[j]); c.vertical_alignment=1
   tc=c._tc.get_or_add_tcPr(); borders=OxmlElement('w:tcBorders')
   for edge in ['top','left','bottom','right']:
    b=OxmlElement('w:'+edge); b.set(qn('w:val'),'single'); b.set(qn('w:sz'),'4'); b.set(qn('w:color'),'D9D9D9'); borders.append(b)
   tc.append(borders)
   margins=OxmlElement('w:tcMar')
   for edge in ['top','left','bottom','right']:
    e=OxmlElement('w:'+edge); e.set(qn('w:w'),'85'); e.set(qn('w:type'),'dxa'); margins.append(e)
   tc.append(margins)
   sh=OxmlElement('w:shd'); sh.set(qn('w:fill'),'E8EDF2' if i==0 else ('F7F8FA' if i%2==0 else 'FFFFFF')); tc.append(sh)
   for pp in c.paragraphs:
    pp.paragraph_format.space_after=Pt(2); pp.paragraph_format.line_spacing=1.0
    for r in pp.runs: r.font.size=Pt(9); r.bold=i==0
 d.add_paragraph().paragraph_format.space_after=Pt(0)

d.add_heading('Family Medicine Mobile App Technical Specification',0)
p('Version 1.0   |   17 October 2026   |   Engineering design for review')
p('Requirements baseline: Family Medicine Mobile App Requirements Specification version 2.1, dated 17 October 2026.')
p('Build an Android first medicine management app with shared Android and iOS code, a Spring Boot backend and PostgreSQL. The design below translates the requirements into service boundaries, data structures, API contracts, synchronization rules and release tests. Engineering, product, security and QA should use it to agree implementation details before development.')
h('Design status')
p('Product requirements retain their original identifiers. Technical decisions and numerical settings introduced here are proposed unless explicitly required by the baseline. Vendor selection, framework versions, jurisdiction, retention approval and platform notification capabilities require the decision gates in Section 12. This document defines no clinical interpretation or dosing algorithm.')
h('Scope and delivery')
table(['Release','Technical scope'],[
('Android pilot','Email and mobile identity, approved family links, manual schedules, local reminders, offline logs, conflict resolution, history and optional stock.'),
('Android MVP','Pilot plus private prescription capture, extraction and mandatory review, CSV export, deletion and operational hardening.'),
('iOS and later','iOS needs separate notification and device validation. Additional caregivers, Hindi and responsive web follow later.')],[1.2,5.45])
h('Document map')
p('1 Architecture and mobile structure\n2 Identity and access\n3 Data model and consistency\n4 Prescription processing\n5 Scheduling engine\n6 Dose events and stock\n7 Synchronization and offline storage\n8 Local notifications\n9 API contracts\n10 Security and privacy\n11 Quality and operations\n12 Traceability and delivery decisions')

page('1 Architecture and mobile structure')
p('Use a modular monolith for the pilot: one deployable API and a separately runnable worker sharing versioned domain modules and PostgreSQL. This keeps transactional dose and stock behavior straightforward while allowing extraction jobs to scale independently. No microservice split is needed for the initial load.')
table(['Component','Responsibility'],[
('React Native and TypeScript','Screens S01 to S10; typed API client; validation; encrypted cache and outbox; schedule preview; native notification adapters.'),
('Spring Boot API','Authentication, member authorization, versioned commands, schedule expansion, dose reconciliation, exports and signed file access.'),
('Worker and durable outbox','Extraction dispatch, upload scanning, provider polling, synchronization signals, exports and retention jobs. Retry with deduplication.'),
('PostgreSQL','Authoritative identities, grants, instructions, occurrences, dose evidence, conflicts, stock ledger and audit metadata.'),
('Private object storage','Quarantined uploads, approved prescription originals and expiring exports. Never public object ACLs.'),
('External adapters','SMS, email, extraction and optional push. Credentials and clinical processing remain on the backend.')],[1.65,5])
h('Dependency flow')
p('Mobile UI → application use cases → domain rules → repository and platform interfaces. API controller → command/query service → member authorization → domain transaction → database and outbox. Worker → validated provider adapter → structured draft storage. External provider responses never invoke activation commands.')
h('Client organization')
p('Group modules by identity, family, prescriptions, medicines, schedules, doses, history and settings. Share domain types, recurrence fixtures and presentation logic across Android and iOS. Keep permissions, secure storage, notification scheduling, lifecycle events and file selection behind platform interfaces.')
p('Today reads the local projection immediately and shows sync age. All screens use explicit loading, empty, offline, denied, partial failure and retry states. Forms persist encrypted drafts. Actions show the selected member and use text plus icons for status. Navigation uses Today, Family, History and Settings.')
h('Build feasibility gate')
p('Select supported framework versions and the React Native build workflow only after a native notification proof of concept. Validate restart recovery, permission handling, rolling capacity and cancellation on physical Android devices. Pin dependencies and record the tested versions in an architecture decision record.')

page('2 Identity and member authorization')
h('Authentication contracts')
p('Support verified email/password and mobile/SMS OTP as separate identities attached to one stable user UUID. Normalize mobile numbers to E.164 after country validation; keep profile contact numbers separate from verified identities. A uniqueness constraint on normalized verified identity prevents duplicate binding. Registration and login responses must not reveal account existence before verification.')
p('Proposed session policy: access tokens expire after 15 minutes; rotating refresh sessions expire after 30 days of inactivity. Store refresh credentials in OS secure storage; store only a hash server-side. Revoke affected sessions after phone change, recovery, deletion or suspected compromise. Final session and offline-cache lifetimes require security approval.')
h('OTP processing')
p('Challenge fields include purpose, normalized identity reference, verifier, expiry, attempts, resend lineage and consumed time. Use a keyed verifier for the low-entropy code and keep the key outside the database. Defaults from the requirements are six digits, five minutes, five attempts, 30 second resend cooldown and five sends/hour/number, supplemented by IP/device and daily limits. Lock the challenge when verifying so expiry, attempt count and single use are atomic. Resend supersedes the previous challenge. Delivery status never verifies identity.')
h('Family linking state machine')
p('PENDING → IDENTITY VERIFIED → MEMBER ACCEPTED → MANAGER APPROVED → LINKED. Both acceptance and authorized-manager approval are required to release an unclaimed profile history. Rejected, expired, revoked and disputed are terminal or review states. Login can complete before linking, but grants remain absent until all link conditions pass. Do not merge histories automatically.')
p('After linking, create self grants for the member account. Continue the manager grant for an independent adult only after that adult explicitly consents. Linking preserves the member UUID and its history and does not change reminder routing. Children remain managed profiles until eligibility and transition rules are approved.')
table(['Principal','Allowed scope'],[
('Household manager','Members with current manager grants and recorded authority or consent; no automatic access to a linked adult.'),
('Linked member','Their own member records and self-service controls; no access to other household members.'),
('Operator','Operational metadata only. Exceptional support access requires a scoped expiring grant and audit trail.')],[1.5,5.15])
h('Authorization implementation')
p('Every query, mutation, cursor feed, export and file access resolves the authenticated user to a live member grant. Deny by default and recheck inside mutation transactions. Household ID alone is insufficient. Membership removal revokes household grants; it never deletes an independent adult account. Member records remain attached to stable ownership even when historical household references remain for provenance.')

page('3 Data model and consistency')
p('Use UUID identifiers, UTC timestamp instants and IANA timezone names. Store local dates and clock times separately where recurrence requires them. Use decimal quantities with explicit units; never floating point dose or stock amounts. Member records retain household provenance plus stable member ownership and explicit access grants.')
table(['Entity group','Essential fields and constraints'],[
('User and identity','user_id; identity kind; normalized value; verified_at; unique verified identity. Session hash, expiry and revocation.'),
('Household and member','household_id; member_id; owner_user_id nullable for dependents; name; relationship; optional DOB/avatar; archived_at.'),
('Grant and consent','user_id, member_id, capability set, consent_id, validity, revoked_at; authority type and evidence reference.'),
('OTP and member link','Challenge purpose, protected verifier, counters; pending link actors, acceptance, approval, expiry and dispute state.'),
('Prescription and job','member_id, private object key, checksum, media type, scan state; extraction status, provider version, attempts.'),
('Medicine and instruction','medicine_id; name, strength; immutable instruction version, dose text, amount/unit if known, route, meal text, source page and review actor/time.'),
('Schedule version','schedule_id, version, instruction_version_id, recurrence, local times, weekdays, timezone, inclusive dates, no-end acknowledgment, effective_at, lifecycle state.'),
('Occurrence','occurrence_id; schedule version; nominal local date/time slot; resolved due_at UTC; timezone; cancellation marker; unique version/date/slot.'),
('Dose evidence and conflict','client_event_id unique per actor account; occurrence or PRN medicine reference; action; actual_at; recorded_at; received_at; actor/device; correction ancestry; conflict state.'),
('Stock and device','Append-only stock transaction, explicit unit, source event and reversal reference; device recipient, routing generation, last reconciliation.'),
('Infrastructure records','Idempotency key and request hash; outbox; ordered change feed; tombstones; audit metadata; expiring export and deletion jobs.')],[1.5,5.15])
h('Database invariants')
p('Require foreign keys and member-consistency checks across linked records. Protect immutable instruction and schedule versions from in-place edits. Uniqueness covers occurrence slots, event IDs, stock effects and reversals. Lock occurrence and stock rows in a consistent order during dose transitions. A conflict cannot independently create two effective stock deductions.')
p('Index member/date occurrence queries, active grants, identity lookup, pending jobs and change-feed sequence. All paginated queries have deterministic ordering. Persist domain mutation, audit metadata and outbox change in the same transaction. Redact clinical fields from audit summaries while retaining protected domain evidence.')

page('4 Prescription upload and review')
h('Upload lifecycle')
p('DRAFT → UPLOADING → QUARANTINED → SCANNING → QUEUED → PROCESSING → REVIEW REQUIRED. Upload/scan/extraction failures retain a recoverable failure state. Rejected content cannot enter extraction. Initial proposed limits are 10 MB and 10 PDF pages per file; enforce server-side limits in addition to client checks.')
p('Create an upload session after member authorization. Return a short-lived object-storage upload grant restricted to the generated key and permitted size. Finalization verifies actual size, signature/type, checksum and PDF page count. Reject corrupt, encrypted or unsupported documents clearly. Scan in isolation before making the file available to the worker. Abandoned uploads expire through lifecycle cleanup.')
h('Extraction boundary')
p('A durable job refers to the scanned object and member. Workers use a lease and bounded retries; provider timeouts produce a recoverable failure rather than an implicit success. Commit results only if the prescription has not been deleted and the job generation is current. A retry must not duplicate medicines or reviewed drafts.')
p('The provider response is a schema-validated list of medicine drafts: name, strength, dose wording, optional amount/unit, route, frequency wording, meal instruction, start/end/duration, page references, source spans and uncertainty markers. Unknowns remain null. Document text and provider instructions are untrusted content; the adapter has no tool or scheduling privileges.')
h('Review and activation boundary')
p('Show source pages alongside editable fields. Each medicine has its own review state. Save partial reviews without activating. Require review even when confidence is high. Keep product strength distinct from quantity taken. Flag contradictory fields and duplicate active name/strength matches for explicit acknowledgment; preserve legitimate duplicates.')
p('Activation accepts a confirmed instruction version and a reviewed recurrence preview. Validate member, medicine identity, dose instruction, recurrence, actual clock times, timezone, start date and reviewed end condition. For PRN, require explicit as-needed mode without clock times. Unclear clinical wording blocks activation until clarified. Do not infer times from twice daily, convert units or infer duration from stock.')
h('Failure and deletion behavior')
p('Provider outage disables extraction through a feature flag while manual entry remains available. Offline captures remain encrypted local drafts until upload. Server deletion blocks new access and job dispatch immediately; workers check cancellation before retrieval and before commit. Vendor deletion and retention behavior must be agreed before production.')
h('Acceptance evidence')
p('Test multiple medicines, partial saves, invalid JSON, hostile document instructions, incorrect page references, rotated scans, unknown units, timeouts and retry after network loss. Measure draft-or-recoverable-timeout against the 60 second target on a defined supported prescription set.')

page('5 Scheduling and occurrence generation')
h('Canonical schedule contract')
p('A fixed schedule contains recurrence DAILY or WEEKDAYS, unique sorted HH:mm times, selected weekdays when applicable, IANA timezone, inclusive start date, inclusive end date or explicit no-end acknowledgment, instruction version and effective UTC instant. PRN has no recurring occurrences. Unsupported intervals and complex tapers must fail validation rather than being approximated.')
h('Deterministic expansion')
p('For each eligible local date and confirmed time slot, resolve the local value in the stored timezone. On a repeated local time choose the earlier UTC instant and generate one occurrence. On a nonexistent time choose the first valid local instant after the gap. Show adjustments in preview. If separate slots resolve to the same instant, reject activation and request reviewed times rather than creating coincident adjusted doses.')
p('Exclude due instants before activation/effective time and outside inclusive local dates. A duration of N confirmed days calculates end_date = start_date + N - 1; show it for confirmation. Proposed server expansion horizon is 35 days, replenished daily, with bounded expansion for history queries. This server horizon is independent of device reminder capacity.')
p('Derive a stable occurrence UUID from schedule version ID, nominal local date and time-slot ID. Store the nominal slot and resolved instant. The same inputs yield the same occurrence across retries. The server is canonical; shared test fixtures require the client preview to match it. A change to timezone database rules must use reviewed migration and reconciliation, without rewriting recorded history.')
h('Edits pause and resume')
p('An accepted edit creates a new version at an explicit effective instant. Keep old occurrences before the boundary and any existing evidence; cancel superseded unrecorded future occurrences and generate the new version. Previously recorded future occurrences require explicit review and must not be silently replaced. Persist cancellations, replacements and outbox changes atomically.')
p('Pause and end tracking cancel eligible future occurrences and reminders from the effective instant. Resume creates future coverage without catch-up doses. Timezone changes require a preview and explicit acceptance; device timezone changes never silently rewrite the schedule.')
h('Status projection')
p('For an uncancelled occurrence with no effective recorded action: Upcoming before due_at, Due from due_at until due_at + 60 minutes, then Not recorded. Treat the threshold as configurable display policy. Taken and Skipped are explicit evidence-backed outcomes. Cancellation is a lifecycle flag excluded from eligible statistics. Conflicting evidence shows a separate review indicator without falsely selecting one outcome.')

page('6 Dose events stock and history')
h('Command processing')
p('A dose event carries client_event_id, occurrence_id or PRN medicine_id, action, actual_at where applicable, device_recorded_at, device_id, expected revision and optional note. The server supplies actor and receipt time. Confirm a future Taken action in the UI and include early_confirmation in the request. Device time is evidence, not a global ordering authority.')
p('Within one transaction: authorize the member; deduplicate event ID and request content; lock the occurrence projection; validate the action; append evidence; detect conflict; update effective state and stock effects if resolvable; increment revision; append audit and outbox records. A retry of the same event returns the existing result. Reuse of an event ID with different content returns conflict.')
h('Corrections and concurrent actions')
p('Corrections refer to the event being corrected and retain original and replacement values, actor and timestamps. Concurrent identical actions create one effective outcome and retain duplicate submission metadata if needed. Taken versus Skipped, or differing actual times/quantities that cannot be reconciled, create a visible conflict. Preserve both submissions; require an authorized resolution command with expected revision.')
p('While conflict is unresolved, mark status and stock estimate uncertain. Retain any already committed stock effect but do not apply a second conflicting deduction. Resolution selects the effective evidence and atomically applies any necessary reversal/new effect. The app must never suggest a compensating dose.')
h('Stock ledger')
p('Initial quantity, refill, manual adjustment, Taken deduction and correction reversal are append-only transactions. Deduct only when a numeric confirmed dose quantity and stock unit match exactly. Text-only or incompatible units produce a review-required estimate; do not infer conversions. Enforce uniqueness on the effective deduction source and reversal reference.')
p('Reversing Taken restores its deduction exactly once. Serialize concurrent ledger changes. If recorded use makes the estimate negative, preserve the ledger, show an uncertain balance and request review; do not fabricate a nonnegative balance. Low-stock notices require active tracking and a configured threshold, with deduplication per threshold crossing.')
h('History statistics and export')
p('Day/week views use a selected reporting timezone and show the schedule timezone where different. Logging completion = eligible elapsed scheduled occurrences with a resolved Taken or Skipped record / all eligible elapsed scheduled occurrences in the selected range. Exclude PRN and cancelled occurrences; show unresolved conflicts separately. This is a recording metric, not proof of ingestion.')
p('CSV contains member, medicine, instruction version, scheduled UTC/local time and timezone, actual time, recording time, status and authorized notes. Apply member/date filters server-side. Quote fields and neutralize leading spreadsheet formula characters including =, +, -, @ and leading control/whitespace variants. Download grants expire and temporary exports are purged.')

page('7 Offline storage and synchronization')
h('Local storage policy')
p('Use an encrypted mobile database with its key protected by OS secure storage. Keep active profiles, accepted schedules, occurrence coverage, recent history, pending evidence and encrypted capture drafts. Proposed recent-history cache is 90 days and proposed offline unlock lease is seven days after successful online authorization; finalize these with security and product. Expiry blocks protected access until online reauthentication and cannot guarantee erasure of an unreachable device.')
p('Activation, instruction edits, account mutations and reminder transfer are online-only. Offline Taken, Skipped, Snooze and capture drafts remain Pending sync. A local projection may reflect pending actions, but it must retain server state and pending evidence separately.')
h('Push then pull protocol')
p('POST /v1/sync/events submits a bounded batch of independent evidence commands. Return a result per event: ACCEPTED, ALREADY_ACCEPTED, CONFLICT, RETRYABLE or REJECTED. Preserve per-occurrence order for dependent corrections. One rejected member action must not lose other events. Suggested batch limit is 100 events, configurable and enforced server-side.')
p('GET /v1/sync/changes?cursor=... returns authorized changes, tombstones, next_cursor and has_more from a monotonic server sequence. Cursor is opaque, user/device scoped and has no authority itself. Apply each page and persist its cursor in one local transaction. Revalidate grants before every page. Expired cursors trigger a full authorized snapshot after preserving the outbound queue.')
h('Conflict and obsolete schedule evidence')
p('Stale schedule edits fail optimistic concurrency with 409 and current version metadata. Refresh and require review before resubmission. Offline dose evidence for a remotely changed/cancelled occurrence remains attached to that original occurrence and enters reconciliation; never remap it to a replacement dose. Reconcile stock only after a valid effective outcome is selected.')
p('Retry network/temporary server failures with bounded exponential backoff and jitter. Authentication failures pause upload pending reauthentication; revoked grants reject access and trigger protected-cache clearing. Show pending count, last successful sync and actionable error. Do not discard evidence merely because retry limits are reached.')
h('Logout revocation and recovery')
p('Before logout show the number of unsynced records and offer retry or explicit discard. Then cancel local reminders, revoke the session when connected and clear protected cache, drafts and keys. Retain no medical data in shared account-switch state. Reinstall requires online authentication and explicit reminder-device setup; server data cannot restore unsynced events lost with uninstall.')
p('On member removal or remote revocation, deny new server reads/writes immediately and publish tombstones/revocation signals. Connected clients clear the affected cache and cancel reminders on reconciliation. An offline client remains bounded by its local policy; display the limitation during sharing and removal actions.')

page('8 Local notification lifecycle')
h('Device assignment')
p('Store one primary recipient and device per member with a routing generation. Transfer is an online, authorized, explicit command with optimistic revision. Linking alone leaves routing unchanged. The new device downloads the accepted assignment and schedules locally; the former device cancels on reconciliation. Warn that an offline former device can still show stale alerts; never claim an atomic cross-device handover.')
h('Registry and reconciliation')
p('Local registry fields: occurrence_id, schedule_version, routing_generation, platform_notification_id, due_at, snoozed_until, scheduling result and last_checked_at. Use one logical key per occurrence/version and deterministic platform identifiers where possible. Reconciliation computes desired reminders from accepted versions plus pending local actions, compares the registry and cancels/replaces only differences.')
p('Run on activation, accepted edits, successful sync, launch/resume, supported restart/system events and permission changes. Taken/Skipped cancels locally immediately while Pending sync; if rejected, reconcile from current authorized state. Pause, archive, logout and deletion cancel applicable registrations. Push carries a minimal change signal and prompts sync; it never creates a duplicate routine dose alert.')
h('Coverage and platform capability')
p('Query the selected adapter for supported scheduling and pending capacity after validating actual platform APIs. Reserve capacity for snoozes, allocate the earliest upcoming occurrences across all assigned members and aim for seven days where capacity permits. Display actual covered-through time and any uncovered earlier gaps; do not imply seven days merely because some reminders extend that far.')
p('Replenish opportunistically while the app can run and surface coverage expiry prominently. Do not rely on background execution to guarantee renewal. Ready means permissions, device assignment and current coverage checks pass; other states are Permission blocked, Setup incomplete and Unsupported. Last reconciliation, scheduling failures and test-notification result appear in Settings.')
h('Snooze and presentation')
p('Snooze 10, 15 or 30 minutes replaces only that occurrence alert, preserves original due time and history status, and warns about next-dose overlap. Keep its event durable for synchronization without turning it into a dose record. Do not replay overdue reminders after restart or reconnect; show outstanding Not recorded occurrences in Today.')
p('Use generic lock-screen text by default. Detail display is an explicit preference independent from prescription consent. Opening records or acting on Taken/Skipped requires device unlock and appropriate app authorization. Keep scheduled, system-observed presentation, user interaction and recorded-dose telemetry distinct; absent platform evidence, presentation remains unknown.')
h('Platform validation gate')
p('Before choosing a library, verify current Android/iOS APIs, permissions, alarm behavior, store restrictions and pending limits against official documentation and real devices. Record findings and supported OS/device matrix. Do not hard-code unverified platform capacity in shared domain code. Validate iOS independently before its release.')

page('9 API contracts and error handling')
p('Use HTTPS JSON under /v1. Publish OpenAPI from validated request/response schemas. Resolve actor from session; never trust actor, household or ownership fields supplied by clients. All resource identifiers require authorization. Return UTC RFC 3339 timestamps, IANA zones, ISO local dates, explicit units and opaque pagination cursors.')
table(['Endpoint group','Contract'],[
('POST /auth/otp/challenges\nPOST /auth/otp/verify','Challenge purpose and number; masked challenge response. Verify returns session or proof token scoped to identity/link purpose.'),
('POST /auth/email/register\nPOST /auth/email/login','Verification, password login and recovery; rate limited generic responses. Sessions have refresh and revoke endpoints.'),
('POST /identities\nPOST /identities/change','Recent authentication and proof of new identity required. Occupied identity requires controlled resolution.'),
('POST /members\nPOST /member-links/{id}/accept\nPOST /member-links/{id}/approve','Create managed profile or pending link; separate acceptance/approval. Grant consent/revoke and membership-removal endpoints remain distinct.'),
('POST /prescriptions/uploads\nPOST /prescriptions/{id}/finalize\nGET /extraction-jobs/{id}','Upload grant, validated finalization and asynchronous state. Reviewed drafts are versioned under medicines.'),
('POST /schedules/preview\nPOST /schedules\nPOST /schedules/{id}/versions','Canonical preview; idempotent activation; optimistic edits. Pause/resume/end commands have effective times.'),
('POST /dose-events\nPOST /conflicts/{id}/resolve','Idempotent evidence/correction and expected revision; conflict resolution retains all originals.'),
('POST /sync/events\nGET /sync/changes','Per-event acknowledgments and ordered authorized change pages including tombstones.'),
('POST /members/{id}/reminder-device\nPOST /stock-transactions','Versioned explicit routing transfer; auditable stock adjustment/refill with units.'),
('GET /history\nPOST /exports\nPOST /deletion-requests','Filtered authorized history; asynchronous export; confirmed deletion with affected-resource preview.')],[2.55,4.1])
h('Shared command rules')
p('Require Idempotency-Key for activation and other retryable create commands. Scope keys to user and operation; store request hash and result for a proposed seven days. Durable event-ID uniqueness is separate and lasts with retained evidence. If-Match supplies resource revision on edits; missing precondition returns 428, stale revision 409. A key reused with a different payload returns 409.')
p('Use 400 for malformed input, 401 for expired authentication, 404 for unavailable or unauthorized resource lookup, 409 for domain conflict, 422 for valid JSON failing domain rules, 429 with Retry-After for throttling, and 503 for retryable dependency failure. Error body includes stable code, safe message, field errors, retryable and correlation_id; no stack traces or clinical payloads.')

page('10 Security privacy and retention')
h('Controls at trust boundaries')
p('Encrypt transport and persistent server storage; manage keys and secrets outside application configuration committed to source. Separate development, test and production credentials. Private storage grants are short lived and require current member access. File workers use least-privilege roles and bounded compute. Validate provider output and prohibit prescription content from influencing tool permissions or execution.')
p('Hash passwords using a reviewed adaptive password hashing implementation. Apply credential-abuse controls, OTP throttling, refresh rotation, session revocation and recent-auth checks for sensitive operations. Use synthetic data in development. Exclude tokens, OTPs, clinical text, signed URLs and identifiers that expose members from analytics, crash payloads and operational logs.')
h('Mobile protections')
p('Protect database keys and refresh credentials with platform secure storage. Exclude sensitive caches from unapproved backups; prevent sensitive app-switcher previews where supported. Avoid putting health details in push payloads, deep-link query parameters or clipboard defaults. Temporary captures/exports use app-private storage and explicit expiry. Test lost-session, account-switch and notification-action authorization paths.')
h('Consent and deletion')
p('Record prescription-processing notice version and acceptance, guardian authority, linked-adult sharing grants and notification-detail preference independently. A member may revoke manager access without deleting their independent records. Household deletion must detach independent adults and revoke household access rather than cascading through adult-owned records.')
p('Deletion request transaction marks affected resources inaccessible, cancels future schedules server-side, revokes sessions/grants where relevant and emits tombstones. Workers refuse new work on deletion-pending records. Purge originals, derived extraction content, database records, exports and provider-held data through tracked jobs. Retain only approved minimal metadata and a nonclinical restore-suppression record as needed.')
table(['Data class','Proposed policy requiring approval'],[
('Active health records','Retain until user deletion under published policy.'),
('Deleted live records','Purge within 30 days; deny access immediately.'),
('Backup copies','Age out within 90 days; isolate restored data and reapply deletion suppression before serving.'),
('Minimal security audit','180 days without prescription content or unnecessary personal details.'),
('Local cache and export files','Bound by approved offline lease and short temporary-file expiry; clear on logout/revocation reconciliation.')],[1.65,5])
h('Prelaunch review')
p('Confirm deployment and provider regions, subprocessors, retention controls, independent-login eligibility, guardian transition, recovery procedure and store disclosures. No advertising use or training on health data by default. These controls are proposed implementation measures and do not constitute a claim of regulatory compliance.')

page('11 Quality operations and testing')
table(['Target','Verification and evidence'],[
('Cached Today within 2 seconds','Measure cold/warm local rendering on the agreed minimum device with representative cache size.'),
('Ordinary API p95 below 500 ms','Load test 100 concurrent users at 20 requests/second; exclude uploads/extraction, report errors and dataset size.'),
('Extraction within 60 seconds','Supported test set yields a draft or recoverable timeout; report provider latency and failures separately.'),
('99.5 percent monthly server availability','Measure an agreed API availability indicator; explicitly exclude any claim of phone reminder delivery.'),
('RPO 24 hours and RTO 8 hours','Daily encrypted backups; timed restore of database and objects; replay deletion suppression before reopening.'),
('Accessible mobile experience','360 logical pixel layouts, large text, screen readers, semantic labels, focus order, keyboard and non-color states.')],[1.8,4.85])
h('Test layers')
p('Domain tests cover inclusive dates, weekday selection, DST gaps/folds, effective boundaries, PRN, no-end acknowledgment, event idempotency and exact-unit stock. Database integration tests use concurrent transactions for OTP single use, identity uniqueness, stale edits, conflicting dose events and reversals. Contract tests cover API errors, schema validation and released-client compatibility.')
p('End-to-end tests exercise S01 to S10 with loading/offline/denied/retry states. Verify known-ID attacks across households and linked adults for every resource family, files, exports and sync feeds. Include hostile extraction content, upload limits and deletion during processing. Test account switching and revocation cache clearing.')
p('Physical device matrix covers foreground, background, terminated app, reboot, offline, battery restrictions, permission revocation, horizon exhaustion, reinstall, transfer with former device offline, generic lock-screen presentation and authenticated actions. Record OS, manufacturer, adapter version and observed limits. iOS repeats its own release tests.')
h('Deployment and observability')
p('CI validates types, domain/integration tests, dependency vulnerabilities, secrets and signed release builds. Apply backward-compatible database changes before API rollout; support a published mobile API compatibility window. Version and migrate local encrypted schemas with recovery tests. Use staged Android pilot rollout and feature switches for extraction and risky integrations.')
p('Monitor API latency/errors, extraction timeout rate, queue age, sync rejection/conflict counts, OTP abuse, export/purge failures and backup health. Use correlation IDs and coarse aggregates without clinical content. Distinguish scheduling success from observed notification presentation and user interaction.')
p('Runbooks cover extraction/SMS outage, queue backlog, sync conflicts, compromised access, failed retention job and restore. Alerts have an owner and actionable thresholds selected from pilot baselines. Release requires no critical/high security defects, successful restore, all MVP acceptance cases and a consented pilot.')

page('12 Traceability delivery and decisions')
table(['Requirements','Design sections and acceptance evidence'],[
('IAM FAM AUTH LINK','2, 3, 9, 10; AT01 and AT13 to AT20 cover isolation, OTP, consent, identity change, recovery and device routing.'),
('RX MED ARC','1, 3, 4, 9; AT02 plus schema, upload, mandatory-review and transaction integration tests.'),
('SCH DOSE','5, 6; AT03, AT04 and AT11 cover recurrence, immutable evidence, stock and PRN.'),
('NTF','8, 11; AT05, AT06, AT08 and AT20 cover lifecycle, capacity, permissions and device transfer.'),
('OFF SYNC','7; AT07 and AT09 cover durable pending evidence, conflicts, stale schedules and reinstall.'),
('HIS STK PRV SEC','6, 10; AT04 and AT10 plus deletion, export neutralization and authorization tests.'),
('NFR OPS screens S01 to S10','1, 11; AT12 and measured performance, accessibility, restore and compatibility evidence.')],[1.65,5])
h('Implementation sequence and exit criteria')
p('Phase 0 validates native notifications and extraction feasibility; selects supported versions/providers and closes security-critical decisions. Phase 1 delivers verified identity, approved member links, authorization and manual online scheduling. Exit with isolation, OTP and recurrence tests passing.')
p('Phase 2 adds the local registry, encrypted cache/outbox, conflicts, history and stock. Exit with physical Android notification evidence, idempotent dose/stock tests and offline device-transfer behavior documented. This is the functional pilot boundary; security, consent, backup and device checks still gate pilot access.')
p('Phase 3 adds quarantined upload, extraction and mandatory review. Phase 4 completes CSV export, deletion, diagnostics, operations and Android MVP hardening. Exit with AT01 to AT20, restore evidence and approved disclosures. Phase 5 validates iOS independently; later phases add caregiver roles, Hindi and web. Estimate effort after Phase 0 findings.')
h('Decisions to close')
table(['Owner','Decision and blocking milestone'],[
('Engineering','Supported framework versions, build workflow, notification adapter, OS/device matrix and timezone data strategy before Phase 1 implementation.'),
('Product and security','Independent-login age eligibility, guardian transition, disputed/reassigned-number recovery and link approval UX before account pilot.'),
('Product and operations','Country support, SMS/email vendor, extraction quality/budget and hosting region before external integration.'),
('Security and privacy','Session/offline lease, retention values, backup suppression, provider processing terms and regional obligations before pilot data collection.'),
('Product','Name, distribution, launch language, subsequent caregiver priority and pilot business targets before release planning.')],[1.45,5.2])
p('Source reference: Family_Medicine_Mobile_App_Requirements.docx, version 2.1. Requirement IDs and AT01 to AT20 are the controlling product acceptance baseline. Additional technical rules in this document require engineering and product review before becoming implementation commitments.')

footer=s.footer.paragraphs[0]; footer.alignment=2
run=footer.add_run('Family Medicine Technical Specification   |   '); run.font.size=Pt(8)
fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); footer._p.append(fld)
d.core_properties.title='Family Medicine Mobile App Technical Specification'
d.core_properties.subject='Technical design based on requirements version 2.1'
d.core_properties.author=''
d.save(OUT/'Family_Medicine_Mobile_App_Technical_Specification.docx')
print(OUT/'Family_Medicine_Mobile_App_Technical_Specification.docx')
