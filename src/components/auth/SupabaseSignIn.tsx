"use client";

/**
 * Supabase sign-in (migration Phase 4) — replaces Clerk's <SignIn> when the
 * Supabase auth path is active. Google OAuth (the primary method) + email
 * magic-link fallback. Both redirect through /auth/callback, which exchanges the
 * code for a session; the handle_new_user trigger provisions the user on first
 * sign-in.
 */

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/db/browser-client";

export function SupabaseSignIn({
  next = "/account",
  prefillEmail = "",
}: {
  next?: string;
  prefillEmail?: string;
}) {
  const [email, setEmail] = useState(prefillEmail);
  const [status, setStatus] = useState<"idle" | "google" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function redirectTo() {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function signInWithGoogle() {
    const supabase = createBrowserSupabase();
    if (!supabase) return fail("Sign-in is not configured.");
    setStatus("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) fail(error.message);
    // on success the browser is redirected to Google.
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createBrowserSupabase();
    if (!supabase) return fail("Sign-in is not configured.");
    setStatus("sending");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) fail(error.message);
    else setStatus("sent");
  }

  function fail(message: string) {
    setError(message);
    setStatus("error");
  }

  if (status === "sent") {
    return (
      <div className="text-[15px] leading-[1.7] text-m-text-2">
        <p className="font-medium text-m-text">Check your email.</p>
        <p className="mt-2">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={status === "google"}
        className="marketing-button-primary h-11 w-full justify-center px-5 text-[14px] disabled:opacity-60"
      >
        {status === "google" ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-[12px] text-m-text-3">
        <span className="h-px flex-1 bg-m-rule" />
        or
        <span className="h-px flex-1 bg-m-rule" />
      </div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          className="h-11 rounded-[12px] border border-m-rule bg-m-paper px-4 text-[14px] text-m-text outline-none focus:border-m-accent"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="marketing-button-secondary h-11 w-full justify-center px-5 text-[14px] disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      {error && <p className="text-[13px] text-[color:var(--m-danger,#d33)]">{error}</p>}
    </div>
  );
}
