# GuildWright — Session Handoff (2026-08-28)

Written so a fresh Claude Code session opened in this folder (e.g. driven from the phone via
Remote Control) can pick up cleanly. This session was opened in `apps/crew-clock` (not a git repo,
which is why it had no Remote Access button); all real work happened here in `apps/guildwright`.

> Note: this session's auto-memory lives under the `crew-clock` project path
> (`C:\Users\dusty\.claude\projects\C--Dev-RefugeAndSword-apps-crew-clock\memory\`). A session opened
> in `guildwright` will NOT auto-load those files — read them from that path when you need deeper
> background (e.g. `guildwright-qbo-sync.md`, `guildwright-estimates.md`, `guildwright-double-submit.md`).

## Current state
- **Branch:** `security/enable-rls-baseline` — clean working tree, everything committed and pushed.
- **HEAD:** `b43af72`. **Remote:** `legacy-suit-standalone.git` (org RefugeSwordPublishing).
- **Live web bundle:** `index-DXiS28uI.js` at https://app.guildwright.app (deployed; QBO fix is a
  deployed edge function, not in this bundle).
- **Supabase project ref:** `eojpqciokqpmzyneqzmm`.

## Operational cheat-sheet
- **Deploy web:** `npx vercel deploy --prod --yes` then verify the live hash:
  `curl -s https://app.guildwright.app/index.html | grep -oE '/assets/index-[^"]+\.js'`
  (Deploy sometimes returns a transient `"status":"error"` — just re-run; confirm via the hash.)
- **Apply a migration / run SQL:** `node scripts/db-apply.mjs supabase/migrations/<file>.sql`
  or `node scripts/db-apply.mjs -e "select 1"` (session pooler; prints the last result).
- **Deploy an edge function:** `npx supabase functions deploy <name> --no-verify-jwt --project-ref eojpqciokqpmzyneqzmm`
  (these functions verify the JWT internally, so `--no-verify-jwt` is safe).
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## What shipped this session (all committed + deployed)
1. `566e3af` — Subcontractor submit-bid flow was fully dead (missing backend). Built the public
   `subContractorBid` edge fn + fixed the email links; also excluded subcontractor tasks from the
   staff daily-goal picker.
2. `9f00930` — Push-notify a tenant's managers (owner/site_manager) when a sub submits/accepts/
   confirms/declines a bid (no email; rides the notifications-insert push trigger).
3. `384f9ca` — Timecard adjustment requests arrived 5-12x (mobile double-tap). Added an in-flight
   guard + a partial unique index; collapsed existing dupes.
4. `dbcadbc` — Same double-submit class in crew schedule assignments. Unique index on
   (user_id, scheduled_date, project_id) + graceful dup handling; collapsed dupes.
5. `cb84368` — New simplified **Job Sites** page for crew (active projects: name, address, lockbox
   code, tap-to-copy). Also guarded against creating unassigned (null-user) schedule rows. Deleted
   69 legacy orphan schedule rows.
6. `bbaa313` — **Progress billing now tracks per line item** instead of pooling a category average.
   Itemized priors match by `source_ref_id`; an SOV deposit is distributed pro-rata across the
   category's contract lines. SOV "previous %" now derives from the dollar tally of ALL prior
   billing (incl. itemized). Verified with the 4x$100/6x$200/1x$400 example. (User confirmed this
   "did the trick.")
7. `b43af72` — **QBO was emailing clients even with auto-send OFF.** Root cause: the push always
   attached `BillEmail`, and QBO auto-delivers when the customer's preferred delivery method is
   Email, even with `EmailStatus=NotSet`. Fix: attach `BillEmail` only when auto-send is on.

## OPEN ITEM — verify the QBO no-email fix (only pending task)
The fix is deployed but needs one live confirmation, because there's a residual chance QBO auto-fills
the recipient from the customer record and still sends.

**To verify:**
1. Push ONE invoice to QBO with auto-send OFF (the normal path).
2. Read that invoice back from QBO and check `EmailStatus` + `DeliveryInfo`. Expected: `NotSet` and
   NO `DeliveryInfo` (never delivered). If it shows `EmailSent`/`DeliveryInfo`, the fix is
   insufficient and the next lever is setting the customer's preferred delivery method to non-email
   during the push.
3. Read-back method (read-only): `GET https://quickbooks.api.intuit.com/v3/company/<realm_id>/invoice/<qbo_invoice_id>?minorversion=65`
   with the stored `access_token` from `qbo_integration_settings` (company
   `2b659a9d-64b9-4afb-97fc-0cdb3936f8d3`, realm `9130348131607576`). Do NOT print the token.

**Context:** two invoices already went out to real clients before the fix — QBO ids `8311`
(DocNumber `1773Greene_002`, delivered 2026-08-28) and `8286` (`732Jean_002`, delivered 2026-08-21).
Nothing can un-send those; the fix prevents future ones. Full detail in the `guildwright-qbo-sync`
memory note.

## Housekeeping
- This `HANDOFF.md` is untracked (not committed). Delete it once the phone session is oriented.
