"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/db/browser-client";

/**
 * Keeps the Supabase session fresh on the client. The @supabase/ssr browser client
 * auto-refreshes the access token on a timer while mounted and persists the new
 * tokens to cookies, which the proxy reads on the next request. Without a persistent
 * client like this, a user is bounced to sign-in the moment their access token
 * expires (~1h), because the proxy's middleware client does not write refreshed
 * cookies. Renders nothing. No-ops when Supabase Auth isn't configured.
 */
export function SessionKeeper() {
  useEffect(() => {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    // Trigger an immediate refresh-if-needed; the client also refreshes on its own
    // timer for as long as this component stays mounted.
    void supabase.auth.getSession();
    const { data } = supabase.auth.onAuthStateChange(() => {});
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
