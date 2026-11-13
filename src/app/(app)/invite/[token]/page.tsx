import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { acceptInvitation } from "../../properties/actions";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("invite");

  async function accept() {
    "use server";
    const result = await acceptInvitation(token);
    if (result?.error) redirect(`/invite/${token}?error=1`);
  }

  return (
    <div className="card mx-auto max-w-sm text-center">
      <h1 className="mb-4 text-xl font-semibold">{t("title")}</h1>
      {error && <p className="mb-4 text-sm text-red-600">{t("error")}</p>}
      <form action={accept}>
        <button className="btn w-full">{t("accept")}</button>
      </form>
    </div>
  );
}
