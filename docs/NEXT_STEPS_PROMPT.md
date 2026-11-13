# Prompt: build the rest of the House Janitor MVP

You are continuing work on **House Janitor**, a web-first (PWA) app for tracking home maintenance across
multiple properties, planning recurring tasks, sending reminders and budgeting. It is for personal use by
a small household in the Nordics (Finland/Sweden). Repository: `birddanger/house-janitor`, branch `main`.

Read `README.md`, `supabase/migrations/0001_init.sql`, `src/app/(app)/properties/[id]/page.tsx` and
`src/app/(app)/properties/actions.ts` before writing code. They define the conventions you must follow.

---

## 1. What already exists (do not rebuild)

**Stack:** Next.js 15 (App Router, Server Components, Server Actions), TypeScript, Tailwind 4, next-intl
(cookie-based locale, no locale in URL), Supabase (Postgres + RLS, Auth with magic links, Storage), zod 4.

**Working features:** magic-link login, EN/FI/SV switcher, property list/create/overview, shared access
(invite by link, owner/editor/viewer roles, remove member, accept invite at `/invite/[token]`).

**Database (`0001_init.sql`) – already has, with RLS:**
- `properties` (`currency` is per property: EUR/SEK/NOK/DKK/ISK), `property_members (role, notify)`, `invitations`
- `components (name, category, installed_on, expected_lifespan_years, brand, model, warranty_until, notes)`
- `tasks (component_id, title, description, recurrence none|interval|yearly, interval_unit day|week|month|year,
  interval_count, next_due_on, estimated_cost, priority low|normal|high, assigned_to, active, created_by)`
  – a CHECK requires `interval_unit` + `interval_count` whenever `recurrence <> 'none'`
- `maintenance_logs (task_id, component_id, contractor_id, performed_on, title, description,
  kind maintenance|repair|renovation, category, cost, labour_cost <= cost, created_by)`
- `attachments (property_id, log_id, storage_path, file_name, mime_type)`; private storage bucket
  `attachments`, objects MUST be stored at `<property_id>/<uuid>-<file name>` (storage RLS reads the first folder)
- `budgets (property_id, year, amount)`, `contractors (owner_id, …)` (personal, visible to co-members when linked
  to a shared log), `activity_log` (filled by triggers on tasks, logs, components)
- RLS helpers `is_member(pid)`, `can_edit(pid)`, `is_owner(pid)`: members read, owner/editor write, viewers read-only
- RPC `complete_task(p_task_id, p_performed_on, p_cost, p_labour_cost, p_notes)` → inserts a log entry and either
  deactivates a one-off task or rolls `next_due_on` forward from the completion date. Returns the log id.
- RPC `accept_invitation(invite_token)`

**Conventions to follow:**
- Server Components fetch with `createClient()` from `src/lib/supabase/server.ts`; mutations are Server Actions
  in a co-located `actions.ts`, start with `requireUser()`, validate `FormData` with zod, then `revalidatePath`.
- Rely on RLS for authorization. Additionally hide edit controls from viewers in the UI (read role from
  `property_members`). Never use the service-role key in code that runs in the browser or in normal page requests.
- Every user-visible string goes in `messages/en.json`, `messages/fi.json` **and** `messages/sv.json`
  (natural Finnish/Swedish, not literal). Format money with `getFormatter().number(n, {style:"currency",
  currency: property.currency})` and dates with `format.dateTime(...)`. Dates are shown as `dd.mm.yyyy` style via locale.
- Styling: Tailwind with the existing component classes `.card .btn .btn-ghost .input .label` and the `brand`
  colour. Mobile-first: everything must work at 375px width (it will be used on a phone at the hardware store).
- Add row types to `src/lib/types.ts` (or generate them with `supabase gen types` if the CLI is available).
- No new heavy UI libraries. Small focused deps are fine (e.g. `web-push`, `resend`).

**Running environment:** the owner runs the app locally (`npm run dev`, `.env.local`) against a hosted Supabase
project and applies migrations by pasting SQL into the Supabase SQL Editor. So:
- Put every schema change in a **new** numbered file (`supabase/migrations/0002_….sql`, …). Never edit `0001`.
- Migrations must be safe to read and run once in the SQL editor; list in your final message exactly which
  files the owner must run, in order.

---

## 2. Work to do (in this order, one commit per phase)

### Phase A – Property navigation
- Add `src/app/(app)/properties/[id]/layout.tsx` with the property name and a tab bar:
  **Overview · Tasks · History · Components · Budget · Members**. Tabs scroll horizontally on mobile.
  Load the property and the current user's role once here; 404 if not a member.
- Move the members/invitations UI from the overview into `/properties/[id]/members`.
- Overview keeps: upcoming 5 tasks (with overdue highlighted), spent vs budget, a **Recent activity** feed
  (last 10 `activity_log` rows with actor display name and relative time), and a prominent **"+ Log work"** button.
- Remove the "Coming soon" cards.

### Phase B – Tasks (`/properties/[id]/tasks`)
- **List view** grouped into *Overdue*, *This week*, *This month*, *Later*, *No date*. Each row: title, due date,
  component, assignee avatar/initials, estimated cost, priority badge.
- **Calendar view** (toggle): simple month grid built with plain date math (no calendar library), showing task
  titles on their due dates, prev/next month navigation.
- **Create/edit form:** title, description/instructions, component (select), recurrence (one-off / every N
  days·weeks·months·years), next due date, estimated cost, priority, assignee (select from members). Seasonal tasks
  are just yearly tasks with a due date in the right month – no separate season model.
- **Complete:** a dialog/inline form asking performed-on date (default today), actual cost, labour portion, notes;
  calls `complete_task`. Afterwards offer "Attach receipt" linking to the new log entry.
- **Snooze** (+3 days / +1 week / pick date) and **Skip this occurrence** (advance `next_due_on` by one interval
  without creating a log entry). Implement skip as a SQL function `skip_task(p_task_id)` in migration 0002 so the
  interval math lives in one place.
- **Archive/delete** a task. Viewers see everything read-only.
- Filters: "Assigned to me", component.

### Phase C – History / maintenance log (`/properties/[id]/log`)
- Chronological list grouped by year → month; shows title, date, kind, cost (labour portion if > 0), who logged it,
  contractor, attachment count.
- Filters: year, component, kind, contractor; text search over title + description (`ilike` is fine; add a trigram
  or full-text index in 0002 if cheap).
- **Add/edit entry** form (also used by the "+ Log work" button): date, title, description, kind, category,
  component, contractor (select + "add new" inline), cost, labour cost (validate `labour_cost <= cost`).
- **Attachments:** add `src/lib/supabase/client.ts` (`createBrowserClient`). Upload from the browser directly to the
  `attachments` bucket at `<property_id>/<uuid>-<sanitized name>`, then insert the `attachments` row via a server
  action. Accept images and PDFs, max 10 MB. On mobile the file input should allow taking a photo
  (`accept="image/*,application/pdf"`). Show thumbnails for images using short-lived signed URLs; allow delete
  (remove both storage object and row).
- **Contractors page** (`/contractors`, linked from the header): list/add/edit/delete; show "last used" and total
  spent across logs the user can see.

### Phase D – Components (`/properties/[id]/components`)
- List with category, brand/model, install date and a **lifespan bar**: age / expected lifespan, coloured green
  (< 70 %), amber (70–100 %), red (> 100 %). Show warranty status ("warranty until 03.2027" / "expired").
- Create/edit/delete form. Component detail page shows its tasks and its log history.
- Migration 0002: add `components.replacement_cost numeric(12,2)` (used by the budget forecast).

### Phase E – Budget (`/properties/[id]/budget`)
- Year selector (default current year). Set/edit the annual budget (upsert into `budgets`).
- Summary: spent vs budget with progress bar, split routine maintenance vs repair/renovation (`kind`), and
  **labour total for the year** labelled for the household deduction (FI *kotitalousvähennys* / SE *ROT-avdrag*);
  explain it is informational only.
- Spending by category (horizontal bars, plain divs/SVG – no chart library) and by month (12 bars).
- **Suggested budget:** sum of every task occurrence falling in the year (expand recurrences from `next_due_on`
  using `estimated_cost`) + a reserve for components reaching end of life within 5 years
  (`replacement_cost / years remaining`, per year). Show the breakdown and a "Use suggestion" button.
- **12-month forecast:** upcoming estimated task costs by month from today.
- **CSV export** route handler `/properties/[id]/export?year=YYYY` returning the year's log
  (date, title, kind, category, component, contractor, cost, labour_cost, logged by), UTF-8 with BOM,
  `;` separator (Excel in FI/SE locales), decimal comma.
- Put the recurrence-expansion and budget math in `src/lib/budget.ts` as pure functions with unit tests
  (add `vitest`).
- On `/properties` (all properties), show per property: overdue count and this year's spent/budget; totals per
  currency (no conversion).

### Phase F – Onboarding templates
- After creating a property, redirect to `/properties/[id]/setup`: a checklist of suggested **components** and
  **recurring tasks** based on property type and heating type, all pre-ticked and editable (due month, interval,
  estimated cost) before saving in one batch.
- Templates live in `src/lib/templates.ts` (keys + defaults; labels via i18n). Include at least:
  - Autumn: clean gutters (Oct), shut off & drain outdoor taps (Oct), check roof before snow (Oct),
    service snow blower (Oct)
  - Spring: inspect roof & gutters after winter (Apr), check plinth/drainage (May), reopen outdoor taps (May),
    clean ventilation air intake (May)
  - Recurring: chimney sweeping (yearly, only for fireplace/wood/oil heating), ventilation / heat-recovery
    filter change (every 6 months), heat pump filter cleaning (every 3 months, heat-pump heating only),
    smoke detector test (monthly) and battery (yearly), floor drain cleaning (every 6 months), oil/pellet boiler
    service (yearly), sauna stove check (yearly), septic tank emptying (yearly, rural/cottage)
  - Cottage: season opening (May) and closing (Sep/Oct) checklists
  - Components with Nordic lifespans: felt roof 25, sheet-metal roof 45, tile roof 50, wet room waterproofing 20,
    water heater 18, air-source heat pump 12, ground-source heat pump 22, ventilation unit 25, windows 40,
    exterior paint 12, sewer pipes 50
- The same picker is reachable later from the Tasks page ("Add from templates").

### Phase G – Email: invites, reminders, weekly digest
- Use **Resend** (`resend` package). Env vars (server-only, add to `.env.example`): `RESEND_API_KEY`,
  `EMAIL_FROM`. If `RESEND_API_KEY` is missing, skip sending and keep the current "copy invite link" UI, so the
  app still works locally without email.
- Invite email: sent from `inviteMember`; FI/SV/EN based on the inviter's locale; contains property name,
  inviter name, role and the link.
- **Reminders job:** route handler `POST /api/cron/reminders`, protected by `Authorization: Bearer $CRON_SECRET`,
  using a server-only Supabase client with `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`).
  Once a day it:
  - finds active tasks due within each recipient's lead time (default 3 days; options on the day / 3 days /
    7 days) or overdue;
  - picks recipients: the assignee, otherwise all owners/editors of the property with `property_members.notify = true`;
  - sends at most one reminder per task per due date, and overdue nudges at most every 3 days;
  - groups multiple tasks for the same person into one email.
- Migration 0003: `profiles.reminder_lead_days int default 3`, `profiles.weekly_digest boolean default true`,
  and `reminder_log (task_id, user_id, due_on, kind, sent_at)` with a unique key on
  `(task_id, user_id, due_on, kind)` to make the job idempotent.
- **Weekly digest** (Mondays, same endpoint with `?digest=1`): this week's tasks across all of the user's properties.
- **Settings page** (`/settings`): display name, language, lead time, weekly digest on/off, and a per-property
  "notify me" toggle (updates the user's own `property_members.notify`; add an RLS policy allowing a member to
  update only their own `notify` column, or a security-definer RPC).
- Scheduling: document in the README how to trigger it (Vercel Cron in `vercel.json` once deployed, or Supabase
  `pg_cron` + `pg_net` calling the URL). For local testing, document a `curl` command.
- Note in the README: without a verified domain, Resend only delivers to the account owner's address.

### Phase H – PWA and web push
- App icons (simple house SVG → PNG sizes 192/512 + apple-touch-icon), fill `manifest.webmanifest`.
- Service worker `public/sw.js` handling `push` and `notificationclick` (opens the task's property tasks page).
  No offline caching beyond what's needed.
- `push_subscriptions (user_id, endpoint unique, p256dh, auth, created_at)` with RLS "own rows only"
  (migration 0003). "Enable notifications on this device" button in Settings; VAPID keys via env
  (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), sending via the `web-push` package from the
  reminders job alongside email. Remove dead subscriptions on 404/410.
- Note in the UI that on iPhone the app must first be added to the Home Screen.

---

## 3. Quality bar

- After each phase: `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Fix, don't suppress.
- **Database tests:** add `supabase/tests/` with SQL that stubs Supabase's `auth.users`, `auth.uid()`,
  `auth.jwt()` and `storage` (see how the initial migration was verified: create role `authenticated`, set
  `request.jwt.claim.sub/email` via `set_config`) and asserts, for each new function and policy: a stranger sees
  nothing, a viewer can read but not write, an editor can write, `skip_task` and `complete_task` produce correct
  dates for each interval unit, and the reminders dedupe key prevents duplicates. Add an `npm run test:db` script
  that runs them against a local Postgres when `DATABASE_URL` is set.
- Unit tests (vitest) for `src/lib/budget.ts`, recurrence expansion and template selection.
- If a browser is available, smoke-test key pages with Playwright at 375px and 1280px widths and look at the
  screenshots.
- Security: all writes go through RLS-protected queries or `security invoker` functions; any
  `security definer` function must check membership itself and set `search_path`. Validate uploads (type, size).
  Sanitise file names. Never log secrets.
- Accessibility: labelled inputs, buttons with text, keyboard-usable dialogs, sufficient contrast.

## 4. Out of scope (don't build)
Payments/plans, native apps, receipt OCR, AI suggestions, currency conversion, tenant/landlord features,
PDF "service book" export.

## 5. Deliverables
- Commits per phase on a feature branch, pushed; open a PR to `main` only if asked.
- Updated `README.md` checklist, `.env.example` with every new variable (with comments on which are secret).
- A final summary listing: what was built, which migration files the owner must paste into the Supabase SQL
  Editor (in order), which new env vars to set and where to get them (Resend dashboard, `npx web-push
  generate-vapid-keys`, Supabase → Project Settings → API Keys → secret key), and anything left undone.
