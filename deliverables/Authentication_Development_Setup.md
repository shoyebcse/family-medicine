# Accounts: development setup and examples

## No-cost phone testing

Development and test profiles use a local code generator. They never contact an SMS provider, even if provider credentials exist in the environment. The screen displays a labelled test code. There are no SMS charges or cloud builds in this workflow. Use fictional accounts and records.

Example: select phone sign-in, enter a fictional name and `+15555550100`, request a code, then enter the displayed development code. It expires after five minutes and works once. Five failed attempts require a new challenge. Requests are limited by phone and source address. These accounts are marked **ownership not verified**; development codes cannot access verified phone accounts.

Real SMS is disabled by default outside development too. A server-side provider adapter exists, but enabling paid verification is outside the current development setup. No provider account or credentials are required now.

## Email registration and login

Example: choose Create account, use `care-example@example.invalid`, enter a fictional name and matching passwords of at least 12 characters. The server accepts at most 72 UTF-8 password bytes. Registration signs in to an empty account. Add a family profile to start its medicine plan. Sign out in Settings, then sign in using the same email and password.

Passwords are hashed with BCrypt, not stored as plain text. Sessions last 12 hours; the database stores token hashes. Logout revokes the current token when the server is reachable. Native session credentials use SecureStore. Web sessions stay in memory and require sign-in after a reload.

Email ownership is not verified yet. Email verification and forgotten-password recovery remain unfinished. Phone accounts and email accounts are separate; they are not linked by matching names.

## Connect your phone

Run the local PostgreSQL backend using `scripts/Start-Backend.ps1`. For a physical Android device on the same trusted Wi-Fi, set `SERVER_ADDRESS=0.0.0.0` before starting the backend. Set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8080` in `mobile/.env.local`, then restart Expo. The Android emulator uses `http://10.0.2.2:8080`. Browser development can use `http://localhost:8080`.

Use the existing local Android development workflow for rapid changes. This authentication change adds no native package and does not require a paid EAS build. An installed release/preview APK does not automatically pick up source edits. Physical Android login, storage and logout behavior still require device validation. Production requires HTTPS and operational hardening.

## Account isolation and reminders

Example: account A creates a family profile. Account B starts with its own empty records and cannot read A's profile. Choosing sample data opens a separate, fictional in-memory preview.

Signing out clears visible account records and disables this feature's reminders. Sign-out is blocked while dose submissions remain pending so they are not silently discarded. An expired/revoked session returns to sign-in; pending event IDs remain attached to that account while this app process stays open. A temporary connection failure during native session restoration retains an unexpired session and existing reminders. This is not encrypted offline record storage or a durable upload queue.

If offline logout cannot reach the server, the UI explains that local logout succeeded but server revocation is unconfirmed; the token still expires automatically. After sign-in, enable reminders again if needed.

## Remaining release work

Email ownership verification, recovery, production SMS activation, physical-device checks, durable encrypted offline data, independent-adult transitions and granular grants remain open. Managed-profile sharing is now available through invitation, recipient acceptance and final owner approval; see [family access examples](Family_Access_Development_Setup.md). Expired session/challenge and rate-limit row cleanup also needs operational scheduling. Test codes and development authentication must never be exposed as verified production identity.

## Actual verification

On 20 October 2026, 28 backend tests passed with H2, including ten account tests. All 28 tests also passed against the isolated PostgreSQL 17.11 test database. Flyway applied the account migration successfully to the application database, and the development backend is running on port 8080. All 23 mobile tests, TypeScript, ESLint and formatting checks pass. Web and Android Hermes bundle exports pass; the Android export required the local compiler to run outside the sandbox. These exports do not validate an installed APK. Browser visual inspection was blocked by the browser tool's URL security policy. No real SMS, paid cloud build or physical Android login test was run.
