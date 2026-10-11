import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// These are public by design (the database rules protect everything), so they can
// live in the code. Environment variables override them if set.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://garyzggateszublkbael.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_MouOvrZGyPz87kSTlqXoBg_dTsdrBlu";

let client: SupabaseClient | null = null;

// One shared browser client. All rules are enforced in the database,
// so the website only ever uses the public key.
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    });
  }
  return client;
}

export type Side = "brothers" | "sisters";
export type Role = "attendee" | "volunteer" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  side: Side;
  role: Role;
  strikes: number;
  late_cancels: number;
  bans: number;
  ban_nights_left: number;
};

export type Night = {
  id: string;
  night_date: string;
  iftar_at: string;
  room: string;
  capacity_brothers: number;
  capacity_sisters: number;
  booking_opens_at: string;
  status: "scheduled" | "cancelled" | "closed";
};

export type NightCount = {
  side: Side;
  capacity: number;
  booked: number;
  waitlisted: number;
  checked_in: number;
  walkins: number;
  spots_left: number;
};

export type MyBooking = {
  booking_id: string;
  night_id: string;
  night_date: string;
  iftar_at: string;
  room: string;
  night_status: string;
  status: "confirmed" | "waitlisted" | "offered";
  side: Side;
  token: string;
  short_code: string;
  offer_expires_at: string | null;
  checked_in_at: string | null;
  from_waitlist: boolean;
  waitlist_position: number | null;
};

// Turn a Postgres error into a sentence people can read.
export function errorText(e: unknown): string {
  if (!e) return "Something went wrong. Please try again.";
  const msg = (e as { message?: string }).message ?? String(e);
  return msg.replace(/^.*?ERROR:\s*/, "");
}
