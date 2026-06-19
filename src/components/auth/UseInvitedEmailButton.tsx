"use client";

import type { CSSProperties } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { createBrowserSupabase } from "@/lib/db/browser-client";

interface UseInvitedEmailButtonProps {
  className?: string;
  redirectUrl?: string;
  style?: CSSProperties;
}

/** True when the Supabase auth path is active (public env inlined at build). */
function supabaseAuthActive() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

export function UseInvitedEmailButton({
  className,
  redirectUrl = "/sign-in",
  style,
}: UseInvitedEmailButtonProps) {
  if (supabaseAuthActive()) {
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

  const button = (
    <button type="button" className={className} style={style}>
      Use invited email
    </button>
  );
  return <SignOutButton redirectUrl={redirectUrl}>{button}</SignOutButton>;
}
