import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Property } from "@/lib/types";

export default async function PropertiesPage() {
  const t = await getTranslations();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("property_members")
    .select("role, properties(*)")
    .eq("user_id", user!.id)
    .is("properties.archived_at", null);

  const rows = ((data ?? []) as unknown as { role: MemberRole; properties: Property | null }[])
    .filter((r) => r.properties)
    .sort((a, b) => a.properties!.name.localeCompare(b.properties!.name));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("properties.title")}</h1>
        <Link href="/properties/new" className="btn">{t("properties.add")}</Link>
      </div>

      {rows.length === 0 ? (
        <p className="card text-stone-600">{t("properties.empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map(({ role, properties: p }) => (
            <li key={p!.id}>
              <Link href={`/properties/${p!.id}`} className="card block hover:border-brand">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p!.name}</h2>
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                    {t(`roles.${role}`)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-600">
                  {t(`types.${p!.type}`)}
                  {p!.address ? ` · ${p!.address}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
