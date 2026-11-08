# Accounts: development setup and examples

## Set up Google sign-in

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) in your Google Cloud project. Set up Branding and Audience for Family Medicine. For a personal Gmail account, select **External** and add your Gmail address under **Test users** while the app is in Testing.
2. Under **Clients**, create a **Web application** OAuth client. Add `http://localhost:8080/v1/auth/google/callback` under **Authorized redirect URIs**. Copy the client ID and secret into the existing gitignored `.env` in the repository root.

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:8080/v1/auth/google/callback
   GOOGLE_WEB_RETURN_URL=http://localhost:8081/
   ```

3. Restart the backend using `scripts/Start-Backend.ps1`. Start Expo web and open `http://localhost:8081/`. Use exactly the host and port in `GOOGLE_WEB_RETURN_URL` when starting Google sign-in so the browser can recover the original attempt. Select **Sign in with Google**, then pick a test account. [Google OAuth web-server setup](https://developers.google.com/identity/protocols/oauth2/web-server)

For an installed Android or iOS build, use an HTTPS backend callback that the device's browser can reach, and register that exact URL in Google Auth Platform. Point `EXPO_PUBLIC_API_URL` at the reachable API. After Google's account chooser, tap **Return to Family Medicine** in the browser. The installed app must register the existing `family-medicine` scheme. Keep the app running while the browser is open. [Expo Linking](https://docs.expo.dev/versions/v58.0.0/sdk/linking/)

Google sign-in uses OpenID Connect with authorization code, PKCE, state and nonce. It requests identity information only. Google accounts are matched by Google's stable subject ID. If the email is already used by a password account, sign in with that original method. Account linking is a separate operation.

## Set up real SMS verification

1. In [Twilio Verify](https://console.twilio.com/), create a Verify service for Family Medicine. Copy the Verify Service SID (`VA…`), Account SID (`AC…`) and Auth Token into the backend's root `.env`.

   ```dotenv
   SMS_SIGN_IN_ENABLED=true
   TWILIO_ACCOUNT_SID=your-account-sid
   TWILIO_AUTH_TOKEN=your-auth-token
   TWILIO_VERIFY_SERVICE_SID=your-verify-service-sid
   ```

2. Enable the destination country in **Verify → Settings → Geo permissions**. For a trial account, register and verify the test recipient in Twilio. Verify sends real SMS and can incur charges. [Twilio Verify quickstart](https://www.twilio.com/docs/verify/quickstarts) · [Verify geographic permissions](https://www.twilio.com/docs/verify/verify-countries-and-regions-deliverability)
3. Restart the backend and reload or reopen the app. Select **Sign in with SMS code**, enter your name and mobile number with country code, then enter the code received on your phone. A first successful verification creates a phone account. Later sign-ins with that number use the same account.

The app's SMS option uses Twilio Verify. Generated codes run only under the automated `test` profile. Both provider options stay disabled until their respective server settings are present. Keep provider secrets out of the mobile environment and source control.

## Email registration and login

Example: choose Create account, use `care-example@example.invalid`, enter a fictional name and matching passwords of at least 12 characters. The server accepts at most 72 UTF-8 password bytes. Registration signs in to an empty account. Add a family profile to start its medicine plan. Sign out in Settings, then sign in using the same email and password.

Passwords are hashed with BCrypt. Sessions last 12 hours and the database stores token hashes. Logout revokes the current token when the server is reachable. Native session credentials use SecureStore. Web sessions are stored in the current browser tab and survive a reload.

Email ownership is not verified yet. Email verification and forgotten-password recovery remain unfinished. Phone accounts and email accounts are separate; they are not linked by matching names.

## Connect your phone

Run the local PostgreSQL backend using `scripts/Start-Backend.ps1`. For a physical Android device on the same trusted Wi-Fi, set `SERVER_ADDRESS=0.0.0.0` before starting the backend. Set `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8080` in `mobile/.env.local`, then restart Expo. The Android emulator uses `http://10.0.2.2:8080`. Browser development can use `http://localhost:8080`.

Use the existing local Android development workflow for rapid changes. This authentication change adds no native package and does not require a paid EAS build. An installed release/preview APK does not automatically pick up source edits. Physical Android login, storage and logout behavior still require device validation. Production requires HTTPS and operational hardening.

## Account isolation and reminders

Example: account A creates a family profile. Account B starts with its own empty records and cannot read A's profile. Choosing sample data opens a separate, fictional in-memory preview.

Signing out clears visible account records and disables this feature's reminders. Sign-out is blocked while dose submissions remain pending so they are not silently discarded. An expired/revoked session returns to sign-in; pending event IDs remain attached to that account while this app process stays open. A temporary connection failure during native session restoration retains an unexpired session and existing reminders. This is not encrypted offline record storage or a durable upload queue.

If offline logout cannot reach the server, the UI explains that local logout succeeded but server revocation is unconfirmed; the token still expires automatically. After sign-in, enable reminders again if needed.

## Remaining release work

Password-account email verification and recovery, live provider and physical-device checks, durable encrypted offline data, independent-adult transitions and granular grants remain open. Managed-profile sharing is available through invitation, recipient acceptance and final owner approval. Expired session/challenge and rate-limit row cleanup needs operational scheduling. [Family access examples](Family_Access_Development_Setup.md)

## Actual verification

On 20 October 2026, 28 backend tests passed with H2, including ten account tests. All 28 tests also passed against the isolated PostgreSQL 17.11 test database. Flyway applied the account migration successfully to the application database, and the development backend is running on port 8080. All 23 mobile tests, TypeScript, ESLint and formatting checks pass. Web and Android Hermes bundle exports pass; the Android export required the local compiler to run outside the sandbox. These exports do not validate an installed APK. Browser visual inspection was blocked by the browser tool's URL security policy. No real SMS, paid cloud build or physical Android login test was run.
