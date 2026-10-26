# Low-stock alerts

## Set an alert

When adding a medicine, enter initial stock and the confirmed numeric amount per dose in the same unit. In **Low-stock alert at**, enter the remaining quantity at which you want a warning. Leave it blank to disable alerts. No threshold is assumed.

Example: initial stock **20 tablets**, amount each time **1 tablet**, threshold **5**. When a confirmed Taken action reduces the estimated stock from 6 to 5, the app shows a warning. A repeated request for that same dose does not deduct twice. Skip does not reduce stock. A threshold of **0** warns when the estimate is depleted or negative.

For liquid stock, enter mL for both stock and dose; the threshold is also in mL. There are no bottle, strip, strength or pack conversions. A missing numeric dose cannot enable stock alerts. Stock never determines dose, frequency or treatment duration.

## Existing medicines

Open **Family**, find the medicine and edit **Low-stock alert (unit)**. Select **Save stock alert**. Clear the field and save to turn it off. Only currently authorized accounts can change a profile's threshold. Refills and a stock correction ledger are not implemented in this change.

## What appears

A persistent warning lists low-stock medicines and their estimated remaining quantities inside the signed-in app. The server evaluates the authoritative threshold using decimal quantities. The app checks newly loaded confirmed stock and successful dose updates; failed or unacknowledged dose submissions do not cause speculative deductions.

If notification permission is already granted, the app also requests a generic local notification: **Estimated medicine stock is low. Open Family Medicine to review your supply.** Member and medicine names remain out of desktop/lock-screen notification text. The warning includes **Enable / test stock notifications** to request permission and retry a notification. Denial or notification failure leaves the in-app warning available. Android uses a separate Medicine supply channel; stock notifications do not dismiss dose alarms or record Taken/Skipped.

To enable permission in advance, open **Settings → Medicine supply notifications → Enable stock notifications**. Permission alone does not enable a medicine's threshold; choose that separately.

## Delivery limits

Notifications are requested when this running app receives confirmed stock, not by a server push service. If someone records a dose on another device, this device needs to refresh; foreground records normally refresh once a minute. Closed or suspended apps do not check stock. Opening and refreshing later shows the current warning. There is no SMS and no paid provider.

Automatic notifications are deduplicated once per medicine's low-stock episode during this app session. Refreshes and dose retries do not repeat them. Disabling the threshold, losing access or stock returning above the threshold ends the episode. Reloading or signing in again may produce a fresh notification; deduplication is not persisted across restarts. Notification presentation and sound depend on browser/device permissions, channel settings and OS policy. Physical Android notification validation remains open.

Verification on 20 October 2026: all 39 backend tests pass against PostgreSQL 17.11, including threshold boundaries, Taken retries, Skip, API validation, disabling thresholds, saved flags and access isolation. All 28 mobile tests pass, including decimal threshold boundaries and per-session episode deduplication. TypeScript, ESLint and formatting checks pass. The Android Hermes export passes; that does not prove installed-device notification presentation. Migration V6 applied to the local application database. No SMS, remote push request, paid build or new package was used. Browser visual/notification and physical-device checks remain open.
