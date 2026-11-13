"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { CURRENCIES, PROPERTY_TYPES } from "@/lib/types";

const optionalInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().nullable());
const optionalNum = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nullable());
const optionalStr = z.preprocess((v) => (v === "" ? null : v), z.string().nullable());

const PropertySchema = z.object({
  name: z.string().min(1),
  address: optionalStr,
  type: z.enum(PROPERTY_TYPES),
  year_built: optionalInt,
  size_m2: optionalNum,
  heating_type: optionalStr,
  currency: z.enum(CURRENCIES),
});

export async function createProperty(formData: FormData) {
  const { supabase, user } = await requireUser();
  const input = PropertySchema.parse(Object.fromEntries(formData));
  // Generate the id here: RLS would hide the row from `insert().select()` because the
  // owner membership is only created by the AFTER INSERT trigger.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("properties").insert({ id, ...input, created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/properties");
  redirect(`/properties/${id}`);
}

const InviteSchema = z.object({
  property_id: z.uuid(),
  email: z.email(),
  role: z.enum(["editor", "viewer"]),
});

export async function inviteMember(formData: FormData) {
  const { supabase } = await requireUser();
  const input = InviteSchema.parse(Object.fromEntries(formData));
  const { error } = await supabase.from("invitations").insert(input);
  if (error) throw new Error(error.message);
  // TODO: send the invite link by email (Resend) instead of only showing it in the UI.
  revalidatePath(`/properties/${input.property_id}`);
}

export async function revokeInvitation(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().parse(formData.get("id"));
  const propertyId = z.uuid().parse(formData.get("property_id"));
  await supabase.from("invitations").delete().eq("id", id);
  revalidatePath(`/properties/${propertyId}`);
}

export async function removeMember(formData: FormData) {
  const { supabase } = await requireUser();
  const propertyId = z.uuid().parse(formData.get("property_id"));
  const userId = z.uuid().parse(formData.get("user_id"));
  const { error } = await supabase
    .from("property_members")
    .delete()
    .eq("property_id", propertyId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/properties/${propertyId}`);
}

export async function acceptInvitation(token: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_invitation", { invite_token: token });
  if (error) return { error: error.message };
  redirect(`/properties/${data}`);
}
