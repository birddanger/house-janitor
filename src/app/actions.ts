"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LOCALES, type Locale } from "@/i18n/request";
import { createClient } from "@/lib/supabase/server";

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale") as Locale;
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("profiles").update({ locale }).eq("id", data.user.id);
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
