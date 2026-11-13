import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Invitation, Member, Property, Task } from "@/lib/types";
import { inviteMember, removeMember, revokeInvitation } from "../actions";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const format = await getFormatter();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: property } = await supabase.from("properties").select("*").eq("id", id).maybeSingle<Property>();
  if (!property) notFound();

  const year = new Date().getFullYear();
  const [{ data: members }, { data: tasks }, { data: logs }, { data: budget }] = await Promise.all([
    supabase.from("property_members").select("property_id, user_id, role, profiles(email, display_name)").eq("property_id", id),
    supabase
      .from("tasks")
      .select("id, title, next_due_on, estimated_cost, priority")
      .eq("property_id", id)
      .eq("active", true)
      .order("next_due_on", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase.from("maintenance_logs").select("cost").eq("property_id", id).gte("performed_on", `${year}-01-01`),
    supabase.from("budgets").select("amount").eq("property_id", id).eq("year", year).maybeSingle<{ amount: number }>(),
  ]);

  const memberList = (members ?? []) as unknown as Member[];
  const myRole = memberList.find((m) => m.user_id === user!.id)?.role;
  const isOwner = myRole === "owner";

  // RLS only returns invitations to owners.
  const { data: invites } = isOwner
    ? await supabase
        .from("invitations")
        .select("id, email, role, token, expires_at, accepted_at")
        .eq("property_id", id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
    : { data: [] };

  const spent = (logs ?? []).reduce((sum, l) => sum + Number(l.cost), 0);
  const money = (n: number) => format.number(n, { style: "currency", currency: property.currency });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{property.name}</h1>
        <p className="text-sm text-stone-600">
          {t(`types.${property.type}`)}
          {property.address && ` · ${property.address}`}
          {property.year_built && ` · ${property.year_built}`}
          {property.size_m2 && ` · ${property.size_m2} m²`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="mb-3 font-semibold">{t("property.upcoming")}</h2>
          {(tasks as Task[] | null)?.length ? (
            <ul className="divide-y divide-stone-100">
              {(tasks as Task[]).map((task) => (
                <li key={task.id} className="flex justify-between py-2 text-sm">
                  <span>{task.title}</span>
                  <span className="text-stone-500">
                    {task.next_due_on && format.dateTime(new Date(task.next_due_on), { dateStyle: "medium" })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">{t("property.noTasks")}</p>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">{t("property.budget")}</h2>
          <p className="text-2xl font-semibold">{money(spent)}</p>
          {budget && (
            <>
              <p className="text-sm text-stone-500">/ {money(Number(budget.amount))}</p>
              <div className="mt-3 h-2 rounded bg-stone-100">
                <div
                  className="h-2 rounded bg-brand"
                  style={{ width: `${Math.min(100, (spent / Number(budget.amount)) * 100)}%` }}
                />
              </div>
            </>
          )}
        </section>
      </div>

      <nav className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["tasks", "log", "components", "budget"] as const).map((s) => (
          <div key={s} className="card text-center text-sm">
            <div className="font-medium">{t(`sections.${s}`)}</div>
            <div className="text-xs text-stone-400">{t("property.comingSoon")}</div>
          </div>
        ))}
      </nav>

      <section className="card">
        <h2 className="mb-3 font-semibold">{t("property.members")}</h2>
        <ul className="divide-y divide-stone-100">
          {memberList.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {m.profiles?.display_name ?? m.profiles?.email}
                <span className="ml-2 text-stone-500">{m.profiles?.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">{t(`roles.${m.role}`)}</span>
                {isOwner && m.user_id !== user!.id && (
                  <form action={removeMember}>
                    <input type="hidden" name="property_id" value={id} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button className="text-xs text-red-600 hover:underline">{t("property.remove")}</button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>

        {isOwner && (
          <>
            <form action={inviteMember} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="property_id" value={id} />
              <input className="input" name="email" type="email" required placeholder={t("property.inviteEmail")} />
              <select className="input sm:w-40" name="role" defaultValue="editor">
                <option value="editor">{t("roles.editor")}</option>
                <option value="viewer">{t("roles.viewer")}</option>
              </select>
              <button className="btn">{t("property.invite")}</button>
            </form>

            {(invites as Invitation[] | null)?.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium">{t("property.pendingInvites")}</h3>
                <ul className="space-y-2">
                  {(invites as Invitation[]).map((inv) => (
                    <li key={inv.id} className="rounded bg-stone-50 p-2 text-sm">
                      <div className="flex justify-between">
                        <span>{inv.email} · {t(`roles.${inv.role}`)}</span>
                        <form action={revokeInvitation}>
                          <input type="hidden" name="id" value={inv.id} />
                          <input type="hidden" name="property_id" value={id} />
                          <button className="text-xs text-red-600 hover:underline">{t("property.remove")}</button>
                        </form>
                      </div>
                      <div className="mt-1 break-all text-xs text-stone-500">
                        {t("property.copyLink")}: {siteUrl}/invite/{inv.token}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
