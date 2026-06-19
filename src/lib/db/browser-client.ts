/**
 * Browser Supabase client for Strelva — used by client components (sign-in flow,
 * any client-side session read). Carries the user session via cookies set by the
 * @supabase/ssr server/proxy adapters.
 *
 * NULL-SAFE: returns null when public Supabase env is unset, so client components
 * keep rendering on the Clerk path until the auth swap is flipped on.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createBrowserSupabase(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createBrowserClient<Database>(url, key);
}
