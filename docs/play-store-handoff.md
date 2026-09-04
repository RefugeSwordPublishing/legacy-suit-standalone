# GuildWright, Google Play submission handoff

Build and signing steps live in `NATIVE_ANDROID.md`. This is what Play needs on top of a working
build, and what will get the submission rejected if it is missing.

Verified against the repo on 2026-09-02, updated 2026-09-04.

## Already done

| Item | State |
|---|---|
| App id | `com.guildwright.app` (permanent once published) |
| targetSdk / compileSdk | 36, above Play's current floor |
| minSdk | 24 |
| versionCode / versionName | 2 / "1.0.1" |
| Adaptive launcher icon | Branded, 16.7% inset on both layers, not the Capacitor default |
| FCM | `google-services.json` present and its package matches |
| POST_NOTIFICATIONS | Merged in from the push plugin |
| Privacy policy URL | https://guildwright.app/privacy |
| Keystore in repo | None, which is correct |

## Blockers, all cleared

Recorded so nobody reopens them. Each was a genuine stop-ship.

**Account deletion.** Did not exist. There is now an in-app request under Settings, Your account,
a public page at guildwright.app/delete-account, and a queue in the admin console. It records a
request rather than deleting on the spot, because an owner account holds a tenant other people
work in and crew timecards are business records attached to finished jobs.

**Privacy policy.** Said "approximate location at clock-in" when the app takes a precise fix at
clock-in and clock-out and shows it to company admins. It now matches, carries a deletion
timeline, and has a numbered "Deleting your account" section a reviewer can find.

**Location disclosure.** The clock-in went straight to the OS permission prompt. A disclosure now
precedes it, naming what is collected and who reads it. Declining still clocks you in without a
location, which is why location is declared optional on the data safety form.

**In-app purchase policy.** The app linked to Stripe checkout from three places. Billing is hidden
in the native build now and points at the web. Nothing is sold inside the Android app.

## Data safety form

Submitted 2026-09-04 by CSV import, which is far quicker than the per-type wizard. Everything is
collected, tied to identity, and none of it is shared: Supabase and Vercel are processors, which
Play does not count as sharing. Fourteen types declared, including device identifiers, since
push_subscriptions stores a device push token. Address and payment info are deliberately absent.

| Category | Data | Purpose |
|---|---|---|
| Personal info | Name, email, phone | Account, crew management |
| Location | Approximate and precise | Clock-in geofence |
| Photos | Receipt images | Expense records |
| Financial info | Estimate, invoice and expense amounts | Core product function |
| App activity | Diagnostics and error logs | Crash and error reporting |

Payment card data never touches the app: Stripe handles it on the web.

## Store listing

- App name: GuildWright
- Category: Business
- Short and full description
- Icon: the HD icon in the repo
- Feature graphic, 1024x500
- Phone screenshots, at least two, taken at phone width. The marketing captures are desktop shots
- Content rating questionnaire
- Target audience: not children

Take screenshots from **Timberline** or **GuildWright Demo Co**, never Legacy. Store listings are public and
permanent, and Legacy's screens carry real client names and addresses.

## What is left

1. Content rating questionnaire.
2. Phone screenshots, at least two, taken at phone width from Timberline or GuildWright Demo Co.
   The marketing captures are 1920x1032 desktop shots and should not be submitted as phone ones.
3. Upload the AAB to internal testing, confirm it installs and runs, then promote to production.

Done: account deletion, privacy policy, location disclosure, web-only billing, feature graphic
(1024x500, platform badges removed), store listing copy, data safety form, and the reviewer
account. Run `npm run cap:sync` immediately before building any new AAB; the bundled web assets
have gone stale twice.
Review for a new app usually takes several days, and the first submission of an app that collects
location often draws extra questions. Expect one round.
