"use client";

import type { CSSProperties } from "react";
import { createBrowserSupabase } from "@/lib/db/browser-client";

interface UseInvitedEmailButtonProps {
  className?: string;
  redirectUrl?: string;
  style?: CSSProperties;
}

export function UseInvitedEmailButton({
  className,
  redirectUrl = "/sign-in",
  style,
}: UseInvitedEmailButtonProps) {
  async function signOut() {
    const supabase = createBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    window.location.href = redirectUrl;
  }
  return (
    <button type="button" className={className} style={style} onClick={signOut}>
      Use invited email
    </button>
  );
}
