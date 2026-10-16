"use client";

/**
 * Supabase sign-in: Google OAuth and, once email delivery is qualified, an
 * email sign-in link. Both return through /auth/callback, which exchanges the
 * code for a session; the handle_new_user trigger provisions the user on
 * first sign-in.
 *
 * XA (Pen XA · B1): one ink pill (the email link when email is ready,
 * otherwise Google), the other method as a white pill, and bad news said by
 * Pebble in one sentence. The sent state stays in place (no modal) and names
 * the address, with Send again and Use a different email as text links.
 */

import { useState, type ReactNode } from "react";
import { XaButton, XaButtonLink, XaField, XaHeadline, XaLede, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { signInErrorCopy } from "./sign-in-errors";
import { createBrowserSupabase } from "@/platform/infra/db/browser-client";

/** Preview harnesses only: open already sent, or already failed. */
export type SupabaseSignInInitial = { status: "sent" } | { error: string };

export function SupabaseSignIn({
  next = "/account",
  prefillEmail = "",
  heading,
  emailReady = false,
  emailLabel = "Email",
  initial,
}: {
  next?: string;
  prefillEmail?: string;
  heading?: ReactNode;
  emailReady?: boolean;
  /** "Work email" on the business door. */
  emailLabel?: string;
  initial?: SupabaseSignInInitial;
}) {
  const [email, setEmail] = useState(prefillEmail);
  const [status, setStatus] = useState<"idle" | "google" | "sending" | "sent" | "error">(initial ? "status" in initial ? "sent" : "error" : "idle");
  const [error, setError] = useState<string | null>(initial && "error" in initial ? initial.error : null);

  function redirectTo() {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function signInWithGoogle() {
    const supabase = createBrowserSupabase();
    if (!supabase) return fail("Sign-in is not configured.");
    setStatus("google");
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
      if (error) fail(signInErrorCopy(error, "google"));
    } catch { fail("Sign-in is temporarily unavailable. Try again."); }
  }

  async function sendMagicLink(event?: React.FormEvent) {
    event?.preventDefault();
    if (!emailReady) return;
    const supabase = createBrowserSupabase();
    if (!supabase) return fail("Sign-in is not configured.");
    setStatus("sending"); setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
      if (error) fail(signInErrorCopy(error, "email"));
      else setStatus("sent");
    } catch { fail("The sign-in link could not be sent. Try again."); }
  }

  function fail(message: string) {
    setError(message);
    setStatus("error");
  }

  if (status === "sent") return <div className="flex flex-col gap-[22px]" data-xa-sign-in="sent">
    <XaHeadline>Check your email</XaHeadline>
    <XaLede>We sent a sign-in link to <strong className="font-medium text-[var(--st-text)]">{email}</strong>. Open it on this device to continue.</XaLede>
    <div className="flex flex-wrap gap-2">
      <XaButtonLink href="https://mail.google.com" target="_blank" rel="noopener noreferrer">Open Gmail</XaButtonLink>
      <XaButtonLink href="https://outlook.live.com/mail" target="_blank" rel="noopener noreferrer">Open Outlook</XaButtonLink>
    </div>
    <p className="m-0 flex flex-wrap gap-x-2 text-[14px] leading-5 text-[var(--st-text-2)]">
      No email after a minute? <XaTextLink onClick={() => void sendMagicLink()}>Send again</XaTextLink><span aria-hidden="true">·</span><XaTextLink onClick={() => { setEmail(""); setStatus("idle"); }}>Use a different email</XaTextLink>
    </p>
  </div>;

  const busy = status === "sending" || status === "google";
  return <div className="flex flex-col gap-[22px]" data-xa-sign-in="form">
    {heading}
    {emailReady ? <form onSubmit={sendMagicLink} className="flex flex-col gap-[22px]">
      <XaField label={emailLabel} type="email" required autoComplete="email" inputMode="email" spellCheck={false} autoCapitalize="none" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@yourbusiness.com" disabled={busy} />
      <XaButton type="submit" variant="primary" size="lg" block busy={status === "sending"} disabled={status === "google"}>Email me a sign-in link</XaButton>
    </form> : null}
    <XaButton variant={emailReady ? "secondary" : "primary"} size="lg" block onClick={() => void signInWithGoogle()} busy={status === "google"} disabled={status === "sending"}>Continue with Google</XaButton>
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
  </div>;
}
