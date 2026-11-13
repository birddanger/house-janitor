-- House Janitor: table privileges for the `authenticated` role.
--
-- 0001_init.sql enables RLS and defines policies but never grants table
-- privileges. RLS can only narrow privileges that already exist, so without
-- these grants every query fails with 42501 "permission denied for table ..."
-- before any policy is evaluated. (Supabase's default privileges cover this in
-- some projects and not others; granting explicitly makes the schema portable.)
--
-- Privileges below mirror the policies in 0001_init.sql exactly. `anon` gets
-- nothing: every route is behind auth via src/middleware.ts.

grant usage on schema public to authenticated;

-- Profiles: "profiles read" (select) + "profiles update self" (update).
-- Rows are created by the handle_new_user() trigger (security definer).
grant select, update on profiles to authenticated;

-- Properties: read / insert / update / delete policies.
grant select, insert, update, delete on properties to authenticated;

-- Members: read / update / delete policies. No insert — rows are written only
-- by the add_creator_as_owner() trigger and accept_invitation(), both definer.
grant select, update, delete on property_members to authenticated;

-- Invitations: "invitations owner" is `for all`.
grant select, insert, update, delete on invitations to authenticated;

-- Contractors: "contractors own" is `for all`, plus a shared-read policy.
grant select, insert, update, delete on contractors to authenticated;

-- Property-scoped data: read for members, write for editors/owners.
grant select, insert, update, delete on components       to authenticated;
grant select, insert, update, delete on tasks            to authenticated;
grant select, insert, update, delete on maintenance_logs to authenticated;
grant select, insert, update, delete on attachments      to authenticated;
grant select, insert, update, delete on budgets          to authenticated;

-- Activity log: "activity read" only. Writes come from the log_activity()
-- trigger and accept_invitation(), both security definer.
grant select on activity_log to authenticated;

-- RPCs called from the app. complete_task is security invoker, so it relies on
-- the table grants above; accept_invitation is definer.
grant execute on function accept_invitation(text) to authenticated;
grant execute on function complete_task(uuid, date, numeric, numeric, text) to authenticated;
grant execute on function is_member(uuid) to authenticated;
grant execute on function can_edit(uuid)  to authenticated;
grant execute on function is_owner(uuid)  to authenticated;
