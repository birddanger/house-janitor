import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { setLocale, signOut } from "../actions";
import { LOCALES } from "@/i18n/request";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Link href="/properties" className="mr-auto font-semibold text-brand">
            {t("app.name")}
          </Link>
          <Link href="/properties" className="btn-ghost hidden sm:inline-flex">
            {t("nav.properties")}
          </Link>
          <form action={setLocale} className="flex">
            {LOCALES.map((l) => (
              <button
                key={l}
                name="locale"
                value={l}
                className={`px-2 py-1 text-xs uppercase ${l === locale ? "font-bold text-brand" : "text-stone-500"}`}
              >
                {l}
              </button>
            ))}
          </form>
          <form action={signOut}>
            <button className="btn-ghost">{t("nav.signOut")}</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
