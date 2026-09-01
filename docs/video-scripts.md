# GuildWright walkthrough videos

One job, recorded end to end, cut into standalone chapters. The viewer watches the same
address accumulate data instead of being told the features connect.

Chapters mirror the in-app **SetupChecklist** (`src/components/onboarding/SetupChecklist.jsx`),
so the videos and the checklist a new tenant already sees reinforce each other.

---

## Production rules

**Record in Timberline Renovations, never Legacy.** Admin portal, Timberline, "Log in as owner".
Legacy's data has real client names, addresses, and email addresses in it. One stray frame is a
leak you cannot recall from a published video.

**Reset between takes** with `scripts/seed-demo-tenant.mjs`. It aborts if the tenant exists, so
delete Timberline from the admin Danger Zone first, then re-seed.

**Never say a price out loud.** Pricing changed twice in the last month. Spoken numbers cannot be
edited later; put pricing in a text overlay or leave it to the pricing page.

**Open each chapter with the tier it needs.** A Field user watching the Expenses chapter will hunt
for a nav item that does not exist for them.

**Two to four minutes per chapter, one task each.** The app ships changes weekly. Short chapters
mean a UI change costs one re-record instead of a twenty minute redo.

**Setup:** 1920x1080, browser zoom 110% so text reads on a phone, bookmarks bar hidden, no other
tabs, notifications off.

---

## Chapter map

| # | Chapter | Route | Tier | Checklist step |
|---|---|---|---|---|
| 1 | Set up your company | `/settings` | Field | Complete your company profile |
| 2 | Invite your crew, roles, and pay | `/users`, `/roles`, `/permissions` | Field | Invite your crew |
| 3 | Cost codes and your catalog | `/cost-codes` (two tabs) | Pro | Add your cost codes |
| 4 | Estimates, templates, rapid estimator | `/estimates`, `/estimates/templates/new` | Field | Build your first estimate |
| 5 | Expenses and categories | `/expense-categories`, `/expenses` | Pro | Set up expense categories |
| 6 | Invoicing and QuickBooks | `/invoices`, `/qbo-settings` | Pro | Connect your accounting |

A seventh cut, 90 seconds, is the marketing version: the same job start to finish with no
instruction. Same footage, different edit. Plan the shots for both before recording.

---

## Chapter 1: Set up your company

**Length:** 2 to 3 minutes. **Tier:** Field and up.
**Starting state:** fresh tenant, company profile blank, setup checklist visible on the dashboard.

### Shots

1. **Dashboard, checklist visible.**
   Say: "This is a brand new GuildWright account. Everything on this checklist takes about fifteen
   minutes, and the first item is the one every document you send depends on."

2. **Click "Complete your company profile".** Lands on `/settings`.
   Say: "Your company profile prints on every estimate and invoice a client sees, so it's worth
   getting right once."

3. **Fill company name, address, phone, email, website.** Type at normal speed, do not narrate
   each field.
   Say: "Name, address, phone, email. This is the letterhead."

4. **Save, then show the checklist item flip to done.**
   Say: "The checklist tracks it, so you can hand this to someone else and see what's left."

5. **Settings, Invoices & Estimates.** Show **Numbering style** and **Start numbering at**, with
   the "Your invoices will look like" preview updating live.
   Say: "Pick a numbering format now rather than after you've sent invoices. Each project numbers
   its own invoices from its own prefix, so jobs never share a sequence."

6. **Show Payment schedule and Terms & conditions fields.**
   Say: "Whatever you put here lands on every estimate by default. Write it once."

7. **Close on the dashboard with the first item checked.**
   Say: "Next: getting your crew in, and setting what each of them can see."

### Say this out loud

- Branding and logo are set up during onboarding, not self-serve. Do not imply a logo upload
  button exists in Settings.
- The invoice prefix is suggested from the project address when a project is created. Mention it
  here so it is not a surprise in chapter 4.

### Do not show

- The Billing card, which exposes plan pricing.
- Error Log or any admin-only surface.

---

## Chapter 2: Invite your crew, roles, and pay

**Length:** 3 to 4 minutes. **Tier:** Field and up.
**Starting state:** company profile complete, no crew invited yet, default roles present.

### Shots

1. **Dashboard, click "Invite your crew".** Lands on `/users`.
   Say: "GuildWright is priced per company, not per seat, so add everyone. There's no reason to
   share a login."

2. **Click Invite.** Fill **First Name**, **Last Name**, **Email Address**, pick a **Role**.
   Say: "Role decides what they see. A crew member gets tasks, timecards, and chat. A site manager
   adds projects and scheduling. Admin and owner see the money."

3. **Send Invite.** Show the pending state.
   Say: "They get an email with a link to set their own password. You never handle it."

4. **Set Pay type and rate** on the new user. Show **Hourly** and **Salary**.
   Say: "Wages live here. Without them, labor cost and profitability are blank, so this is not
   optional if you want job costing to mean anything."

5. **Open Rate history and add a rate with an Effective date.**
   Say: "Give a raise here rather than overwriting the old number. Reports use the rate that was in
   effect on the date the work happened, so last quarter's numbers stay correct."

6. **Settings, Roles (`/roles`).** Rename a role, show **Role name** and **Permission tier**.
   Say: "The four base roles are fixed underneath, but the labels are yours. If your crew says
   Foreman, call it Foreman."

7. **Settings, Permissions (`/permissions`).** Show the Feature / Read / Write grid.
   Say: "This is the fine control. Read and write, per feature, per role. It's enforced in the
   database, not just hidden in the menu, so a hidden page is genuinely closed."

8. **Show Account Active toggle on a user.**
   Say: "When someone leaves, deactivate rather than delete. Their timecards and history stay
   attached to the jobs they worked."

9. **Close on the crew list with two or three people in it.**
   Say: "Next: cost codes and your catalog, which is what makes estimating fast."

### Say this out loud

- Deactivating prevents login and is the correct move for a departing employee. Deleting a user
  orphans their history.
- Permissions are enforced by database policy. Worth saying plainly, because it is a real
  difference from tools that only hide menu items.

### Do not show

- Real crew names or emails. Use the seeded Timberline people.
- The Gusto Payroll settings page unless you are recording a payroll chapter.

---

## Chapter 3: Cost codes and your catalog

**Length:** 3 minutes. **Tier:** Pro (see the note below). **Route:** `/cost-codes`, titled
**Cost Codes & Catalog**, two tabs on one page.
**Starting state:** company profile and crew done, both tabs empty.

### Shots

1. **Settings, Cost Codes.** Land on the page, show both tabs before touching either.
   Say: "Two lists live here, and they do different jobs. Cost codes are how you group money.
   The catalog is how you stop retyping prices."

2. **Cost Codes tab. Add three or four codes.** Fields are **Code** and **Name**, nothing else.
   Say: "A code and a name. Keep the list short enough that your crew will actually pick the right
   one. These tag estimate lines and expenses, so they're what job costing groups by, and they're
   what maps to QuickBooks products later."

3. **Say the reassurance out loud, on camera.**
   Say: "Cost codes are a manual field. Nothing forces one onto a line, and leaving one blank
   doesn't break anything. An unmapped line falls back to a generic service item in QuickBooks."

4. **Catalog tab. Add an item.** Show **Item name**, **Description**, **Category**, **Unit**
   (placeholder reads `ea, SF, HR...`), **Default Qty**, **Cost Code (optional)**, **Notes**.
   Say: "This is your price book. Name, unit, default quantity, and what it costs you. Attach a
   cost code here once and every estimate line built from this item inherits it."

5. **Add two or three more items quickly, then use Search catalog.**
   Say: "Build this out as you go. Every item you add is one you never price from scratch again."

6. **Show the Inactive toggle on an item.**
   Say: "Retire an item rather than deleting it. Old estimates keep referencing it, so the history
   stays honest."

7. **Close on the populated catalog.**
   Say: "Next: turning this list into an estimate, and then into an estimate you can build while
   standing in the house."

### Say this out loud

- Cost codes are manual and blank is safe. This is the single most common worry and it is worth
  saying plainly rather than letting people guess.
- A cost code attached to a catalog item flows into every line built from it. That is the payoff
  for filling the optional field.

### Do not show

- The QuickBooks item mapping screen. It belongs to chapter 6 and needs a live QBO connection.

### Tier note

A Pro tenant sees two tabs, Cost Codes and Catalog. A Field tenant sees only Catalog, and the
heading reads "Catalog". Record on Pro and say early that cost codes are the Pro half, so one take
serves both audiences.

---

## Chapter 4: Estimates, templates, and the rapid estimator

**Length:** 4 minutes, or split at shot 6 if it runs long. **Tier:** Field and up.
**Starting state:** catalog populated from chapter 3, at least one client in the directory.

### Recording order matters here

The rapid estimator **starts from a template**, so a template has to exist before you can
demonstrate it. Record in this order or the last third of the chapter has nothing to open.

### Shots

1. **Financial, Estimates, New.** Set **Client** from the **Client Directory**, and either link a
   **Project (optional)** or leave it **Standalone**.
   Say: "An estimate can hang off a project or stand on its own for a bid you haven't won yet."

2. **Add a section, then add line items.** Pull from the catalog rather than typing.
   Say: "Sections are how the client reads it. Line items come out of the catalog you just built,
   so the pricing is already yours."

3. **Show markup on a line, and the GC fee toggle.**
   Say: "Markup is per line. The GC fee sits on top of everything as its own line, so a client sees
   project management priced honestly instead of buried."

4. **Preview.** Show the client-facing document with Timberline's branding.
   Say: "That's what lands in their inbox, in your colors."

5. **Send to Client, or Copy Client Link.** Show the signing view, sign it, show the status flip
   to **Approved**.
   Say: "They sign in the browser. No printing, no scanning, and the estimate marks itself
   accepted the moment they do."

6. **Estimates page, Templates tab, new template.** Lands on the **Rapid Estimate Template**
   builder. Give it a **Template name**.
   Say: "This is the part that pays you back. Build the shape of a job you quote often, once."

7. **Add sections and line items to the template, then pin.** Click the pin icon on the items you
   count on site. Hover shows **Pin to Rapid Estimate quick-count**.
   Say: "Pin the things you actually count while walking a house. Outlets, doors, fixtures. Those
   pinned items are about to become your worksheet."

8. **Save, back to Estimates, start a Rapid Estimate. Pick the template.**
   Say: "Now the reason this exists."

9. **Walkthrough step.** Show every section on one screen and the sticky **Quick count** bar
   riding along the top. Enter a count in the bar, then expand that section to show the same
   number already there.
   Say: "One screen, every section, and the pinned items follow you down the page. Count as you
   walk. The bar and the section are the same number, so it doesn't matter where you type it."

10. **Scope step.** Show the scope of work pre-filled from the material line items, then edit one.
    Say: "The scope of work writes itself from what you just counted. Read it, fix the wording,
    done."

11. **Finish, land on the built estimate, Preview.**
    Say: "That's a priced estimate with a scope of work, from a walkthrough. Next: what happens to
    the money once the job is running."

### Say this out loud

- The rapid estimator is for estimating **on site**, not for typing faster at a desk. That is the
  whole point of the sticky quick-count bar, and it is the thing a viewer will not work out on
  their own.
- Templates are built directly as Rapid Estimate Templates. There is no "save this estimate as a
  template" button, so do not imply one.

### Do not show

- `/templates` in the main nav. That page is **Task Templates** for projects and has nothing to do
  with estimates. Naming it on camera will send people to the wrong screen.

---

## Chapter 5: Expenses and categories

**Length:** 3 to 4 minutes. **Tier:** Pro. **Routes:** `/expense-categories`, then `/expenses`.
**Starting state:** a live project from chapter 4, no expenses logged yet. A new tenant already has
Materials and Subcontractor as categories, so do not pretend the list starts empty.

### Shots

1. **Settings, Expense Categories.** Show the two that ship with a new account.
   Say: "This is the list your crew picks from when they log a receipt. Every account starts with
   Materials and Subcontractor."

2. **Add a category** in **New category**, something real like Permits or Dump Fees, and set its
   **Cost bucket**.
   Say: "The bucket is the part worth understanding. It decides where this spend lands on a
   project's Financials tab."

3. **Show the explanation already on the page**, then say it in your own words.
   Say: "Set a category to Subcontractor and its spend lands on the subcontractor line. Materials,
   Labor, and Other all roll into materials and costs. So Permits still counts toward what the job
   actually cost you, it just isn't a sub."

4. **Financial, Expenses.** Empty state.
   Say: "Nothing logged yet. Here's the fastest way to change that."

5. **Add Expense, then Take Photo.** The camera opens inside the app. Capture a prop receipt.
   Say: "That's the camera in the app, not your phone's camera roll. The crew snaps it at the
   supply house and moves on."

6. **Let the extraction run.** Show the **Extracting...** indicator, then the fields filling in:
   **Vendor**, **Date**, **Total Amount**, and the **Line Items** underneath.
   Say: "It reads the receipt and fills the form. Vendor, date, total, and the line items."

7. **Correct the total on camera.** Do this deliberately, do not edit it out.
   Say: "Always check the total. Faded thermal receipts are the hard case, and a receipt is worth
   more than a guess."

8. **Set Category, Project, and Cost Code.**
   Say: "Category and project are what make this show up in job costing. The cost code is optional
   and leaving it blank is safe."

9. **Show Billable to client**, already on.
   Say: "Billable is on by default. Leave it on for anything the client is paying for, turn it off
   for a tool you bought for yourself."

10. **Save, then show the header stats:** **Total Shown** and **Unbilled Billable**.
    Say: "That unbilled number is the one to watch. It's money sitting on a job that nobody has
    invoiced yet."

11. **Filter with All Projects.**
    Say: "Filter by job when you want to see what one address has cost you."

12. **Close on the unbilled total.**
    Say: "Next: turning that into an invoice and getting it into QuickBooks."

### Say this out loud

- Extraction starts on its own when the receipt is attached. There is no Scan button, so do not say
  "click scan" or a viewer will hunt for one.
- Photos from an iPhone are converted automatically, so HEIC files just work.
- Checking the total is not optional. Say it while doing it.

### Do not show

- A real receipt with a partial card number, a signature, or a client's name on it. Use a prop.
- Any Legacy vendor or amount.

---

## Chapter 6: Invoicing and QuickBooks

**Length:** 4 to 5 minutes, or split at shot 6. **Tier:** Pro.
**Routes:** `/qbo-settings`, then `/invoices`.
**Starting state:** an approved estimate from chapter 4 and unbilled billable expenses from
chapter 5, both on the same project.

### Read this before recording

Do not claim that a push with auto-send off will not email the client. On a QuickBooks company
with online delivery enabled, QuickBooks fills in a recipient itself and sends anyway, whatever
GuildWright asks for. Script shot 3 to describe what GuildWright does, not what QuickBooks will do.

### Shots

1. **Settings, QuickBooks.** Show **QBO Integration** and connect.
   Say: "One connection per company. Sign in to Intuit, authorize, done."

2. **Sync Settings.** Show the toggles: **Invoices**, **Clients**, **Projects**.
   Say: "Turn Projects on and each job becomes its own sub-customer under the client in
   QuickBooks. Every invoice for that address nests under it, so your books read the way your jobs
   do."

3. **Auto-send to client**, off by default.
   Say: "Auto-send controls whether GuildWright emails the invoice when it pushes. Off means
   GuildWright creates it and leaves it for you to review. Check your QuickBooks delivery settings
   too, because QuickBooks has its own opinion about emailing invoices."

4. **Map categories and cost codes to QuickBooks items.**
   Say: "Map each category to the product or service it should hit. Anything unmapped falls back
   to a generic service item rather than failing, so a blank never breaks a push."

5. **Financial, Invoices, New Invoice.** Set **Client**, **Project**, **Invoice Number**,
   **Issue Date**, **Payment Terms**.
   Say: "The number comes from the project's own prefix, so each job counts its own invoices."

6. **Import Line Items** from the approved estimate, then import the unbilled billable expenses.
   Say: "Pull the estimate in, then pull in the receipts your crew logged. That's chapter four and
   chapter five landing in the same document."

7. **Billing Mode.** Show **Schedule of Values** against line items.
   Say: "Schedule of values is how you progress bill. Instead of one invoice for everything, you
   bill a percentage of each category as the work gets done."

8. **On a second invoice for the same project, show the Billed to date panel**, then the per line
   **Bill this invoice (%)** and **Bill this invoice ($)** fields.
   Say: "GuildWright shows what's already been billed on this job before you type a number, so you
   don't bill the same work twice. Enter a percentage or a dollar amount, whichever you think in."

9. **Push to QuickBooks.** Show the result toast.
   Say: "That creates the customer, nests the project under it, and builds the invoice with your
   mapped items."

10. **Back on Invoices, Sync Payments.**
    Say: "When a client pays in QuickBooks, this pulls the status back. It also runs on its own
    every night, so paid invoices stop looking outstanding whether you remember or not."

11. **Close on a paid invoice.**
    Say: "Estimate, crew, receipts, invoice, paid. One job, one system."

### Say this out loud

- An unmapped cost code falls back to a generic service item. This is the reassurance that lets
  people start pushing before their mapping is perfect.
- Sync Payments is the dependable path for paid status. Webhooks get dropped; the pull does not.

### Do not show

- The QuickBooks account with real Legacy customers in it. Connect a sandbox or a throwaway QBO
  company for recording.
- Any client email address on the invoice or in the QuickBooks customer record.
