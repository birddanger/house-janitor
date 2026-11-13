"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") return <p className="text-sm text-brand">{t("sent")}</p>;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">{t("email")}</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{t("submit")}</button>
    </form>
  );
}
