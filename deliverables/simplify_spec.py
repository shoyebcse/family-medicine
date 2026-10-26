from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph

root=Path(__file__).parent
path=root/'Family_Medicine_Mobile_App_Technical_Specification.docx'
d=Document(path)

# Explain every main section before its implementation details.
guides={
'1 Architecture and mobile structure':('The phone app handles screens, saved offline data and local reminders. The backend checks permissions and stores the accepted shared records. Background workers handle slower tasks such as prescription extraction.', 'A user uploads a prescription. The API checks that the user can access the selected member, storage holds the private file, and a worker extracts a draft. The user reviews it in the app before any schedule becomes active.'),
'2 Identity and member authorization':('Signing in proves who the user is. A separate permission check decides which family records that user may access. A phone number typed into a profile is only contact information until the required verification and linking steps are complete.', 'Meera adds her adult father Arun and enters his phone number. This does not give that number access to his medical history. Arun verifies his number and accepts the link, and the existing manager approves release of the unclaimed profile. Meera can continue managing Arun’s records only with his explicit consent.'),
'3 Data model and consistency':('Store different kinds of information separately and connect them with stable IDs. Keep earlier instructions and dose evidence so that later changes do not rewrite history.', 'A medicine changes from an 8 AM schedule to a 9 AM schedule. The database creates a new schedule version. Yesterday’s 8 AM dose still points to the old version, so its history continues to show the instructions that applied yesterday.'),
'4 Prescription upload and review':('An uploaded prescription is checked before extraction. Extraction produces editable suggestions, and a person must confirm them before reminders can start.', 'The prescription clearly shows a medicine name but the quantity is unreadable. The review screen keeps the quantity unknown and highlights it. The user must clarify and confirm the instruction; the app cannot guess a quantity and activate reminders.'),
'5 Scheduling and occurrence generation':('A schedule describes the repeating rule. A dose occurrence is one specific planned dose created from that rule. Dates and times are interpreted in the schedule’s saved timezone.', 'The user confirms one dose at 8 AM every day from 20 to 22 October in Asia/Kolkata. The server creates three occurrences, one for each date. These dates are inclusive. An end date of 22 October does not create a dose on 23 October.'),
'6 Dose events stock and history':('Keep what the user submitted as evidence, then calculate the accepted dose status and stock effect. Repeated uploads must not count as additional doses. Conflicting submissions need a visible resolution.', 'Stock starts at 10 tablets and a confirmed dose uses one tablet. The user records Taken while offline. The phone later uploads the same event three times because of connection failures. The server accepts the event once and stock becomes 9, not 7. A later valid reversal restores that deduction once.'),
'7 Offline storage and synchronization':('The app saves supported actions on the phone when there is no connection. It clearly marks them Pending sync. When a connection returns, the server checks the actions, accepts or flags them, and sends back current authorized records.', 'At 8 AM, Arun records Taken without internet. His phone shows one pending record. At 8:20 AM the connection returns, the server accepts that event, and the pending count becomes zero. The actual taken time remains 8 AM; the server receipt time is recorded separately as 8:20 AM.'),
'8 Local notification lifecycle':('The designated phone schedules routine medicine reminders. It keeps a list of scheduled alerts and updates that list whenever accepted schedules or recorded doses change.', 'Arun’s phone holds the 8 AM reminder for a member. Arun records Taken at 7:55 AM after confirming early recording, so the app cancels that occurrence’s reminder. Tomorrow’s reminder stays scheduled. Moving reminder ownership to another phone requires an explicit transfer.'),
'9 API contracts and error handling':('An API is the agreed way the app asks the backend to read or change data. Each request has defined fields, permission checks and responses so both sides handle success and failure consistently.', 'The phone sends POST /dose-events with event ID E123 and occurrence ID O456. If the server accepts it but the response is lost, the phone sends E123 again. The server returns the existing result rather than recording a second dose.'),
'10 Security privacy and retention':('Protect medical information while it is sent, stored and shown. Permission revocation blocks new server access immediately; disconnected phones can only react when they reconnect or their local access policy expires.', 'Arun revokes Meera’s access. Her next server request is denied. When her app reconciles, it removes Arun’s protected cached records and reminders. If her phone is offline, the app cannot promise immediate remote removal from that unreachable phone.'),
'11 Quality operations and testing':('Each performance, reliability and accessibility target needs a repeatable test and recorded results. Backend availability and successful phone reminder delivery are measured separately.', 'A reminder passes while the app is open but fails after a device restart. This is a notification test failure even if the backend is healthy. The team must fix it or document an accepted platform limitation before releasing to the affected device group.'),
'12 Traceability delivery and decisions':('Traceability connects each requirement to the part of the design and test that proves it. Delivery gates identify what must be demonstrated or decided before a release can proceed.', 'AT20 checks that linking an account does not silently move reminders. QA first links Arun’s account and confirms the original device remains assigned. QA then explicitly transfers reminders and checks cancellation on the old phone, including the warning when that phone is offline.')}

def after(anchor,text,style='Normal',bold_prefix=None):
    el=OxmlElement('w:p'); anchor._p.addnext(el)
    pp=Paragraph(el,anchor._parent); pp.style=style
    if bold_prefix and text.startswith(bold_prefix):
        pp.add_run(bold_prefix).bold=True; pp.add_run(text[len(bold_prefix):])
    else: pp.add_run(text)
    return pp

replacements={
'Stale schedule edits fail optimistic concurrency with 409 and current version metadata. Refresh and require review before resubmission. Offline dose evidence for a remotely changed/cancelled occurrence remains attached to that original occurrence and enters reconciliation; never remap it to a replacement dose. Reconcile stock only after a valid effective outcome is selected.':
'Every schedule edit must include the version the phone last read. If someone has already saved a newer version, reject the old edit with HTTP 409 Conflict and information identifying the current version. Fetch the newer schedule and ask the user to review their changes before submitting again. An offline dose record stays attached to its original occurrence even if someone changed or cancelled that occurrence elsewhere. Keep the record for review; never move it to a replacement dose. Apply any stock adjustment only after the accepted outcome has been resolved.',
'Retry network/temporary server failures with bounded exponential backoff and jitter. Authentication failures pause upload pending reauthentication; revoked grants reject access and trigger protected-cache clearing. Show pending count, last successful sync and actionable error. Do not discard evidence merely because retry limits are reached.':
'For a lost connection or temporary server failure, retry with increasing waits, such as roughly 2, 4, 8 and 16 seconds, up to a configured limit. Add a small random delay so phones do not all retry at the same moment. This is called exponential backoff with jitter. If the login session has expired, pause uploads until the user signs in again. If access to a member was revoked, reject access and clear that member’s protected cache when the app processes the revocation. Show how many records are pending, when sync last succeeded and what the user can do next. Reaching the retry limit pauses automatic attempts; it does not delete pending dose evidence.'}

plain={
'Use a modular monolith for the pilot: one deployable API and a separately runnable worker sharing versioned domain modules and PostgreSQL. This keeps transactional dose and stock behavior straightforward while allowing extraction jobs to scale independently. No microservice split is needed for the initial load.':
'For the pilot, organize the backend into clear modules within one application. Run the API and background worker as separate processes, using shared business rules and PostgreSQL. This design is called a modular monolith. It allows a dose record and its stock change to succeed together while letting slower extraction work run separately.',
'Require foreign keys and member-consistency checks across linked records. Protect immutable instruction and schedule versions from in-place edits. Uniqueness covers occurrence slots, event IDs, stock effects and reversals. Lock occurrence and stock rows in a consistent order during dose transitions. A conflict cannot independently create two effective stock deductions.':
'Use database relationships and validation to ensure linked records belong to the same member. Once an instruction or schedule version is saved, create a new version for changes instead of overwriting it. Database uniqueness rules prevent duplicate planned doses, event IDs, stock deductions and reversals. During a dose update, lock the related dose and stock rows in a consistent order so simultaneous actions cannot deduct stock twice.',
'Index member/date occurrence queries, active grants, identity lookup, pending jobs and change-feed sequence. All paginated queries have deterministic ordering. Persist domain mutation, audit metadata and outbox change in the same transaction. Redact clinical fields from audit summaries while retaining protected domain evidence.':
'Add database indexes for common searches such as a member’s doses by date, active permissions, login identities and pending jobs. Return multi-page results in a stable order. Save the accepted change, its audit metadata and its pending synchronization message together in one database transaction: either all are saved or none are. Keep medical text out of operational audit summaries while retaining authorized dose evidence in protected records.',
'Use HTTPS JSON under /v1. Publish OpenAPI from validated request/response schemas. Resolve actor from session; never trust actor, household or ownership fields supplied by clients. All resource identifiers require authorization. Return UTC RFC 3339 timestamps, IANA zones, ISO local dates, explicit units and opaque pagination cursors.':
'Use encrypted HTTPS requests with JSON data and API paths beginning /v1. Publish an OpenAPI reference describing the allowed request and response fields. Identify the acting user from their login session, and verify access to every requested record. A client-supplied user or household ID is not proof of permission. Use standard UTC timestamps, named timezones, local dates and explicit units. For multi-page results, return a server-issued continuation token that the client passes back without changing.'}

allp=list(d.paragraphs)
for t in d.tables:
    for row in t.rows:
        for cell in row.cells: allp.extend(cell.paragraphs)
for pp in allp:
    old=pp.text
    if old in replacements: pp.text=replacements[old]
    elif old in plain: pp.text=plain[old]
    elif old.startswith('Version 1.0   |'): pp.text=old.replace('Version 1.0','Version 1.1')

for pp in list(d.paragraphs):
    if pp.text in guides:
        explanation,example=guides[pp.text]
        a=after(pp,'What this section means: '+explanation,bold_prefix='What this section means: ')
        after(a,'Example: '+example,bold_prefix='Example: ')

# Place detailed worked examples beside the rules that prompted the request.
specific={
'Conflict and obsolete schedule evidence':[
('Old schedule edit','Meera’s phone has version 3 with an 8 AM dose. Arun changes the time to 9 AM and saves version 4. Meera submits an edit based on version 3. The server returns 409 and identifies version 4. Her app loads version 4 and asks her to review her proposed edit; it does not overwrite Arun’s update.'),
('Offline record for a changed dose','Arun records the original 8 AM occurrence as Taken offline. Before sync, Meera replaces future doses with a 9 AM schedule. On sync, the 8 AM evidence remains attached to the original occurrence and is flagged for review. It does not mark the new 9 AM occurrence Taken. Any existing stock deduction remains traceable; no second conflicting deduction is added. Resolution determines whether a reversal or new effect is needed.'),
('Temporary failure and retry','An upload fails because the connection drops. The app retries after about 2 seconds, then 4, then 8, with small random variations and configured limits. After automatic retries stop, it still shows one pending record and offers Retry when appropriate. The record is retained.'),
('Expired login and revoked access','If Arun’s session expires, pending uploads pause and the app asks him to sign in again. If Meera’s access to Arun was revoked, signing in does not restore that permission; the app clears his protected cache when it processes the revocation. A revoked member action is shown as rejected rather than silently lost.')],
'Corrections and concurrent actions':[
('Two different submissions','Arun records Taken while Meera records Skipped for the same occurrence before either sees the other’s action. The app shows a conflict and preserves both records. An authorized person reviews them and selects the effective outcome. Stock follows that resolved outcome.')],
'Coverage and platform capability':[
('Limited reminder capacity','Suppose a tested platform adapter can hold 20 routine reminders after reserving capacity for snoozes. A member has four daily doses. Only five full days fit. The app shows the actual covered-through time and replenishes when possible; it does not claim seven days of coverage.')],
'OTP processing':[
('Resending a code','Arun requests a second code after the resend cooldown. The first code becomes invalid even if its original five-minute lifetime has not ended. The second code is single use, and entering it successfully consumes the challenge.')],
'Canonical schedule contract':[
('Frequency needs actual times','A prescription says twice daily but gives no times. The app requires reviewed clock times, such as 8 AM and 8 PM, rather than choosing them automatically. These example times illustrate input format and are not treatment advice.')],
'Shared command rules':[
('Same request key with different content','The app activates a schedule with key K1. Retrying the same request with K1 returns the original result. Sending a different schedule with K1 returns 409 because a retry key cannot be reused for different content.')],
'Consent and deletion':[
('Removing a linked adult','Meera removes Arun from her household. Her household access ends. Arun’s independent account and his medical records remain available to him. Removing membership must not delete his account.')],
'History statistics and export':[
('A recording statistic','There are 10 eligible elapsed scheduled occurrences: 6 Taken, 2 Skipped and 2 Not recorded. Logging completion is 8 out of 10, or 80 percent. This means 80 percent have a resolved record; it does not mean 80 percent of doses were swallowed.')]
}
for pp in list(d.paragraphs):
    if pp.text in specific:
        # Keep examples after the existing subsection rules and before the next heading.
        anchor=pp
        following=pp._p.getnext()
        while following is not None:
            if following.tag.endswith('}p'):
                candidate=Paragraph(following,pp._parent)
                if candidate.style.name.startswith('Heading') or 'w:type="page"' in following.xml: break
                anchor=candidate
            else: break
            following=following.getnext()
        for label,text in specific[pp.text]:
            anchor=after(anchor,'Example of '+label.lower()+': '+text,bold_prefix='Example of '+label.lower()+': ')

# A short reading aid defines terms that must remain exact in an engineering spec.
anchor=next(pp for pp in d.paragraphs if pp.text=='Document map')
intro=anchor.insert_paragraph_before('Reading the technical terms','Heading 2')
for text in [
'Occurrence means one planned dose at one date and time. A schedule version is a saved edition of the repeating rule. Dose evidence is the original submitted record of an action such as Taken or Skipped.',
'Idempotent means repeating the same request has the same effect as sending it once. Optimistic concurrency means checking that the version being edited is still current before saving. A transaction saves related changes together or saves none of them.',
'Reconciliation means comparing saved records and resolving differences. A grant is a permission to access specific member records. A tombstone is a deletion or revocation marker sent to devices so they can remove outdated local data.',
'An outbox is a durable list of work waiting to be sent. A projection is a current summary calculated from saved records. A cursor is a continuation token used to fetch the next page of changes. PRN means as needed and creates no repeating dose reminders.',
'RPO is the maximum targeted data-loss window after a failure. RTO is the targeted time to restore service. A p95 response time means 95 percent of measured requests finish within that time.'
]: anchor.insert_paragraph_before(text)

d.core_properties.comments='Version 1.1 adds plain-language explanations and worked examples.'
d.save(path)
print(path)
print('Main section guides:',len(guides),'Detailed examples:',sum(map(len,specific.values())))
