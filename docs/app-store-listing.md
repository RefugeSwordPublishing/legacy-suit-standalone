# GuildWright, App Store Connect submission pack

Paste-ready metadata and answers for App Store Connect. The build itself is covered in
`NATIVE_IOS.md`; this is everything that is typed into the console rather than compiled.

Apple Developer Program enrollment: Refuge & Sword Publishing LLC, paid 2026-09-18,
enrollment ID C2U88JUF68.

## App information

| Field | Value |
|---|---|
| Name (30 max) | `GuildWright` |
| Subtitle (30 max) | `One system. Every job.` |
| Bundle ID | `com.guildwright.app`, the same as Android |
| SKU | `guildwright-ios` |
| Primary category | Business |
| Secondary category | Productivity |
| Age rating | 4+, no objectionable content. Answer "None" to every content question |
| Copyright | `2026 Refuge & Sword Publishing LLC` |

Keep the name bare, as on Play. Appending keywords weakens the GUILDWRIGHT trademark claim
(serial 50115785), which is for the word standing alone.

## URLs

| Field | Value |
|---|---|
| Marketing URL | https://guildwright.app |
| Support URL | https://guildwright.app/help |
| Privacy policy URL | https://guildwright.app/privacy |
| Account deletion URL | https://guildwright.app/delete-account |

## Keywords (100 characters, comma separated, no spaces after commas)

```
contractor,construction,estimate,invoice,timecard,jobsite,crew,punch,remodel,subcontractor,bid
```

92 characters. Do not repeat the app name or the subtitle words: Apple already indexes those, so
repeating them wastes the budget.

## Promotional text (170 max, editable without a new build)

```
Estimates, invoicing, scheduling, timecards and QuickBooks sync, for the field and the office. Start a 14-day free trial, no credit card.
```

## Description (4000 max)

```
GuildWright™ runs the whole job, from the estimate you send to the invoice that gets paid.

Built for remodelers and small general contractors who are tired of running a business across a
spreadsheet, a text thread and a shoebox of receipts.

ESTIMATE FASTER
Build estimates from a reusable catalog so you price work once and reuse it forever. The rapid
estimator turns a walkthrough into a priced estimate: pin the items you count on site, tally them
as you walk the house, and the scope of work fills itself in from what you counted. Send a signing
link and the client signs in their browser.

RUN THE CREW
Your crew clocks in from their phones against the job they are working. Schedule the week on one
board, assign tasks, set daily goals, and keep the conversation on the job instead of in a group
text. Hours flow straight into job costing.

TRACK WHAT THE JOB COSTS
Snap a receipt at the supply house and GuildWright reads the vendor, date and total off it. Tag it
to a job and a cost code, and see estimated against actual while the work is still happening
rather than after it is too late to do anything.

BILL AND GET PAID
Progress bill with a schedule of values, or invoice line by line. GuildWright shows what has
already been billed on a job before you enter a number, so nobody bills the same work twice. Push
straight to QuickBooks Online, where each job nests under its client as a sub-customer, and paid
status comes back on its own.

WORK WITH SUBS
Send bid requests, collect submissions and track subcontractor change orders next to everything
else on the job.

ONE PRICE FOR THE COMPANY
GuildWright is priced per company, not per seat, so put your whole crew on it. Every plan starts
with a free trial and no credit card.

Start a free trial in the app, or at guildwright.app. Plans and billing are managed on the web.

GuildWright is a trademark of Refuge & Sword Publishing LLC.
```

## Privacy nutrition labels

Same answers as Play's data safety form, in Apple's wording. Everything below is **linked to the
user's identity**, **not used for tracking**, and **not shared with third parties**.

| Apple category | Data types | Purpose |
|---|---|---|
| Contact Info | Name, email address, phone number | App Functionality |
| Location | Precise Location | App Functionality (clock-in verification) |
| User Content | Photos (receipts), other user content (job notes, messages) | App Functionality |
| Financial Info | Other Financial Info (estimate, invoice and expense amounts) | App Functionality |
| Identifiers | User ID, Device ID | App Functionality |
| Diagnostics | Crash Data, Performance Data | App Functionality |

Answer **No** to "Do you or your third-party partners use data for tracking purposes?" There is no
advertising SDK and no cross-app tracking in the build.

## App Review information

| Field | Value |
|---|---|
| Sign-in required | Yes |
| Demo account | playreview@guildwright.app, the seeded review tenant, same as Play |
| Notes | See below |

Review notes to paste:

```
GuildWright is a job management app for construction contractors. The demo account is a seeded
company with sample projects, crew, timecards, estimates and invoices.

Subscriptions are sold only on our website, not in the app, so no in-app purchase is present.
Signed-in users on iOS see no purchase or upgrade flow of any kind.

Location is used only at clock in and clock out, to record where a shift started and ended for
the employer's timecard records. The app asks for When In Use only and explains this on screen
before the system prompt appears. Location is never collected in the background.

Account deletion is available in the app under Settings, Your account, and on the web at
https://guildwright.app/delete-account.
```

## Screenshots

Apple requires one 6.7 inch set; a 6.5 inch set is used for older devices. At least three shots
per size, ten maximum.

```
node scripts/store-screenshots.mjs --password "<review account password>" --device ios
```

That writes `store-screenshots/6.7` at 1290x2796 and `store-screenshots/6.5` at 1284x2778, signed
in as the review tenant. Never capture a real tenant: listings are public and permanent.

## Icon

`public/appstore-icon-1024.png`, 1024x1024 with no alpha channel. Do not use `public/icon1024.png`
for this, it carries an alpha channel and App Store Connect rejects it.

## Guideline notes worth knowing before review

- **3.1.1, in-app purchase.** Nothing is sold inside the app; `isNativePlatform()` hides every
  billing surface. This is the same arrangement Play accepted.
- **5.1.1(v), account deletion.** Built, in app and on the web, both linked above.
- **5.1.5, location.** The usage string in `NATIVE_IOS.md` is what reviewers read. Location is
  When In Use only; do not add the Always key.
- **2.1, completeness.** Reviewers always sign in. Confirm the review account still works and its
  tenant has data before submitting.
