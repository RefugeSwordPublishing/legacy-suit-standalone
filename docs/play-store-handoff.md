# GuildWright, Google Play submission handoff

Build and signing steps live in `NATIVE_ANDROID.md`. This is what Play needs on top of a working
build, and what will get the submission rejected if it is missing.

Verified against the repo on 2026-09-02.

## Already done

| Item | State |
|---|---|
| App id | `com.guildwright.app` (permanent once published) |
| targetSdk / compileSdk | 36, above Play's current floor |
| minSdk | 24 |
| versionCode / versionName | 1 / "1.0", correct for a first release |
| Adaptive launcher icon | Branded, 16.7% inset on both layers, not the Capacitor default |
| FCM | `google-services.json` present and its package matches |
| POST_NOTIFICATIONS | Merged in from the push plugin |
| Privacy policy URL | https://guildwright.app/privacy |
| Keystore in repo | None, which is correct |

## Blockers, in the order they will bite

### 1. Account deletion. Nothing exists today

Play requires any app offering account creation to provide **both**:

- an in-app path to request account deletion, and
- a **publicly reachable web URL** that works without installing the app.

Neither exists. There is no delete-account path anywhere in `src/`, and the marketing site has no
deletion page. This is the single most common rejection for apps with accounts.

The B2B shape needs a decision before building it. Deleting a crew member is straightforward.
Deleting the **owner** of a company cannot silently destroy the tenant that other people are still
working in, and timecards attached to completed jobs are business records the company may be
required to keep. A defensible split:

- Crew and site managers: in-app request removes their profile and membership.
- Owners: the request opens a support path rather than deleting a live tenant, and says so plainly.
- Web URL: a page describing the same, reachable at guildwright.app.

Note the app already deactivates rather than deletes departing users, and that is the right default.
Deletion has to be a separate, explicit path.

### 2. The privacy policy does not mention deletion

It has to describe what is collected, why, how long it is kept, and how to get it deleted. The
deletion section is currently absent, and Play cross-checks the policy against the Data safety form.

### 3. Location needs a prominent disclosure

The app requests `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` for the clock-in geofence, and
an employer sees where an employee clocked in. Play allows workforce apps, but wants an in-app
disclosure **before** the permission prompt, explaining what is collected and who sees it. There is
no background location permission, which keeps this in the simpler review lane. Do not add one
without a very good reason.

### 4. In-app purchase policy

The app links to Stripe checkout from three places (SettingsHub, twice, and ProGate). Selling
access to the service from inside an Android app is the area Play polices hardest, and the rules
have moved repeatedly.

`isNativePlatform()` already exists in `src/lib/push.js`. The low-risk option is to hide the plan
picker and upgrade buttons in the native build and point those users to the web app instead. The
app stays fully usable, nothing is sold inside it, and the question never arises during review.

## Data safety form

Answer from what the app actually does. Everything below is collected, tied to identity, and not
sold. In transit encryption: yes. Deletion request path: required, see blocker 1.

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
- Phone screenshots, at least two, from the marketing site set
- Content rating questionnaire
- Target audience: not children

Take screenshots from the **Timberline** demo tenant, never Legacy. Store listings are public and
permanent, and Legacy's screens carry real client names and addresses.

## Submission order

1. Ship account deletion, in-app and on the web.
2. Update the privacy policy to match the Data safety answers.
3. Add the location disclosure ahead of the permission prompt.
4. Decide the billing question and, if hiding the CTAs, ship that first.
5. `npm run cap:sync`, bump versionCode, build a signed AAB with Play App Signing.
6. Upload to internal testing, confirm it installs and runs.
7. Complete Data safety, content rating, and listing.
8. Promote to production.

Review for a new app usually takes several days, and the first submission of an app that collects
location often draws extra questions. Expect one round.
