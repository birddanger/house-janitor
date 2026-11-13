// Hand-written row types. Replace with `supabase gen types typescript` output once a project exists.
export type MemberRole = "owner" | "editor" | "viewer";
export type PropertyType = "house" | "rowhouse" | "apartment" | "cottage" | "other";
export type Currency = "EUR" | "SEK" | "NOK" | "DKK" | "ISK";

export interface Property {
  id: string;
  name: string;
  address: string | null;
  type: PropertyType;
  year_built: number | null;
  size_m2: number | null;
  heating_type: string | null;
  currency: Currency;
  purchase_date: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Member {
  property_id: string;
  user_id: string;
  role: MemberRole;
  profiles: { email: string; display_name: string | null } | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface Task {
  id: string;
  title: string;
  next_due_on: string | null;
  estimated_cost: number | null;
  priority: "low" | "normal" | "high";
}

export const PROPERTY_TYPES: PropertyType[] = ["house", "rowhouse", "apartment", "cottage", "other"];
export const CURRENCIES: Currency[] = ["EUR", "SEK", "NOK", "DKK", "ISK"];
