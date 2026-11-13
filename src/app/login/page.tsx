import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-brand">{t("app.name")}</h1>
        <p className="mb-6 mt-1 text-sm text-stone-600">{t("app.tagline")}</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
