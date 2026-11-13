# House Janitor

Web-first (PWA) app for tracking home maintenance, planning recurring tasks, sending reminders and
budgeting across multiple properties, with per-property shared access. Targets the Nordics (FI/SV/EN,
EUR/SEK/NOK/DKK).

**Stack:** Next.js 15 (App Router, Server Actions), Tailwind 4, next-intl, Supabase (Postgres + RLS, Auth, Storage).

## Setup

1. Create a Supabase project (EU region, e.g. Stockholm or Frankfurt).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push` with the CLI).
3. In Supabase → Authentication → URL configuration, add `http://localhost:3000/auth/callback` as a redirect URL.
4. Configure env and run:

```bash
cp .env.example .env.local   # fill in URL + anon key
npm install
npm run dev
```

## Structure

```
supabase/migrations/0001_init.sql   schema, RLS policies, triggers, RPCs (accept_invitation, complete_task)
messages/{en,fi,sv}.json            translations (locale chosen via cookie)
src/middleware.ts                   session refresh + auth guard
src/lib/supabase/server.ts          server Supabase client
src/app/login, auth/callback        magic-link sign-in
src/app/(app)/properties            list, create, property overview + members & invitations
src/app/(app)/invite/[token]        accept an invitation
```

## Access model

Every row is scoped to a property. `property_members` holds `owner | editor | viewer` per property;
RLS helpers `is_member`, `can_edit`, `is_owner` gate all tables and the `attachments` storage bucket
(objects stored under `<property_id>/...`). The creator of a property becomes its owner automatically,
and the last owner cannot be removed.

## Done so far vs. next

- [x] Schema + RLS for all MVP entities
- [x] Magic-link auth, language switcher (EN/FI/SV)
- [x] Properties: list, create, overview
- [x] Shared access: invite by link, roles, remove member, accept invite
- [ ] Tasks UI (recurring/seasonal, complete via `complete_task` RPC)
- [ ] Maintenance log + attachments
- [ ] Components + lifespan bars
- [ ] Budget page, forecast, CSV export
- [ ] Reminders: daily scheduled function → email (Resend) + web push; send invite emails
- [ ] Onboarding wizard with Nordic task templates
- [ ] PWA icons + service worker
