"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/db/browser-client";

interface Props {
  className?: string;
}

/** Ends the personal Supabase session and drops any recipient-bound handoff. */
export function WorkspaceSignOutButton({ className }: Props) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const supabase = createBrowserSupabase();
      if (!supabase) {
        setError("Sign out is not configured. Please try again.");
        return;
      }
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("We couldn’t sign you out. Please try again.");
        return;
      }
      try {
        for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
          const key = window.sessionStorage.key(index);
          if (key?.startsWith("strelva:workspace-") || key?.startsWith("strelva:public-result-")) {
            window.sessionStorage.removeItem(key);
          }
        }
      } catch {
        // Storage may be blocked; the authenticated session was still ended.
      }
      router.replace("/sign-in?next=%2Fworkspace");
      router.refresh();
    } catch {
      setError("We couldn’t sign you out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void signOut()} disabled={signingOut}>
        {signingOut ? "Signing out…" : "Sign out"}
        <LogOut aria-hidden="true" size={14} strokeWidth={1.5} />
      </button>
      {error ? <p role="alert" className="mt-2 text-[11px] leading-relaxed text-critical">{error}</p> : null}
    </>
  );
}
