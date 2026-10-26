# Family mobile access: development examples

Relationship is a dropdown. A managed profile can also store an optional mobile number in international format, for example `+15555550100`. Saving a number never creates an account or grants access by itself. Leave it blank for people who do not sign in.

## Try family access without SMS charges

1. Sign in as the profile owner. In Family, add a fictional member, choose a relationship and enter a fictional phone number with country code. Enable the invitation switch only if you are authorized to share that profile.
2. In a separate browser session or phone, sign in using that same mobile number and the displayed development test code. No SMS is sent. These codes do not prove phone ownership; do not use real health records.
3. Open Family and refresh invitations. Accept the request after reviewing who invited you and which profile will be shared. Acceptance alone does not expose medicine records.
4. The original owner refreshes Family and checks the accepting account name and number. Select **Approve this account’s profile access** only for the intended person.
5. The recipient refreshes invitations and records. Only the approved profile appears. They can view its history, add schedules and record doses. Other family profiles remain private. This is one predefined management permission, not configurable permissions.
6. The owner can select **Remove family access**. The recipient can select **Leave shared profile**. Neither action deletes the profile, its records or either account.

Invitations expire after seven days. A declined or revoked request cannot be accepted or approved. A new request currently requires a new managed profile; editing the contact or re-inviting an existing profile is not implemented. The server records invitation, recipient decision, owner approval and revocation with actor IDs and timestamps.

Outside dev/test, matching phone invitations require a verified phone account. Real SMS remains disabled by default. Email accounts and phone accounts are still separate. Sample mode can demonstrate a contact field but cannot invite accounts or share records.

## Limits and verification

This adds consented access to an owner-managed profile, not a complete independent-adult account transition, guardian verification or granular grant system. No identity or authority is established by a development test code or a self-entered display name.

Revocation prevents subsequent server reads and mutations. Foreground records are refreshed at most once a minute and can be refreshed manually. A denied dose action also removes that profile from the visible lists and reminder snapshot while retaining pending evidence. There is no push revocation or durable encrypted offline cache; a closed device may retain previously scheduled alarms until the next successful reconciliation. Do not treat background revocation as a completed release gate.

On 20 October 2026, all 31 backend tests passed against PostgreSQL 17.11, including family isolation, required recipient acceptance and owner approval, shared schedule/dose access, decline, expiry, audit events, revocation and rejection of unverified development identities outside development. All 23 mobile tests, TypeScript, ESLint and formatting checks pass. Migrations V3/V4 applied successfully to the application database and the API is healthy on port 8080. Browser visual and physical Android tests remain open. No real SMS or paid cloud build was used.
