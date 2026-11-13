"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { status: "error", message: "Invalid email" };
  const next = String(formData.get("next") || "/properties");

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  return error ? { status: "error", message: error.message } : { status: "sent" };
}
