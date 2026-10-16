"use client";

/**
 * Supabase sign-in (migration Phase 4) — replaces Clerk's <SignIn> when the
 * Supabase auth path is active. Google OAuth (the primary method) + email
 * magic-link fallback. Both redirect through /auth/callback, which exchanges the
 * code for a session; the handle_new_user trigger provisions the user on first
 * sign-in.
 */

import { StField, StHead, StMono, StPill, StPillLink, StTextButton, StNotice } from "@/components/ui/strelva/Kit";
import { XaButton, XaButtonLink, XaField, XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { useState, type ReactNode } from "react";
import { signInErrorCopy } from "./sign-in-errors";
import { createBrowserSupabase } from "@/platform/infra/db/browser-client";

export function SupabaseSignIn({
  next = "/account",
  prefillEmail = "",
  heading,
  emailReady = false,
  appearance = "st",
  emailLabel = "Email",
  initialSent = false,
}: {
  next?: string;
  prefillEmail?: string;
  heading?: ReactNode;
  emailReady?: boolean;
  /** "xa" draws the XA entry (A1, B1): ink Continue, white Continue with Google. Behaviour is identical. */
  appearance?: "st" | "xa";
  emailLabel?: string;
  /** Fictional preview only: open on the "check your email" state without sending anything. */
  initialSent?: boolean;
}) {
  const [email, setEmail] = useState(prefillEmail);
  const [status, setStatus] = useState<"idle" | "google" | "sending" | "sent" | "error">(initialSent ? "sent" : "idle");
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

  if (appearance === "xa") {
    if (status === "sent") return <div className="flex flex-col gap-6">
      <XaHeadline quiet={<>We sent a sign-in link to {email}. Open it on this device to continue.</>}>Check your email.</XaHeadline>
      <div className="flex flex-wrap gap-3"><XaButtonLink href="https://mail.google.com">Open Gmail</XaButtonLink><XaButtonLink href="https://outlook.live.com/mail">Open Outlook</XaButtonLink></div>
      <p className="flex flex-wrap gap-x-4 gap-y-2 text-[14px]"><XaTextLink onClick={() => void sendMagicLink()}>Send again</XaTextLink><XaTextLink onClick={() => { setEmail(""); setStatus("idle"); }}>Use a different email</XaTextLink></p>
    </div>;
    return <div className="flex flex-col gap-6">
      {heading}
      <div className="flex flex-col gap-3">
        {emailReady ? <form onSubmit={sendMagicLink} className="flex flex-col gap-5">
          <XaField label={emailLabel} type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@business.com" disabled={status === "sending" || status === "google"} />
          <XaButton type="submit" variant="primary" size="lg" block busy={status === "sending"} disabled={status === "google"}>Continue</XaButton>
        </form> : null}
        <XaButton variant={emailReady ? "secondary" : "primary"} size="lg" block onClick={() => void signInWithGoogle()} busy={status === "google"} disabled={status === "sending"}>Continue with Google</XaButton>
      </div>
      {error ? <p role="alert" className="text-[14px] text-[var(--st-critical)]">{error}</p> : null}
    </div>;
  }

  if (status === "sent") return <div className="flex flex-col gap-5">
    <StHead title="Check your email" meta="We sent a sign-in link to" />
    <StMono tone="text">{email}</StMono>
    <p className="text-sm text-gray-muted">Open it on this device to continue.</p>
    <div className="flex flex-wrap gap-3"><StPillLink href="https://mail.google.com" variant="soft">Open Gmail</StPillLink><StPillLink href="https://outlook.live.com/mail" variant="soft">Open Outlook</StPillLink></div>
    <div className="flex flex-wrap gap-5"><StTextButton tone="accent" onClick={() => void sendMagicLink()}>Send again</StTextButton><StTextButton tone="accent" onClick={() => { setEmail(""); setStatus("idle"); }}>Use a different email</StTextButton></div>
  </div>;

  return <div className="flex flex-col gap-5">
    {heading}
    {emailReady ? <form onSubmit={sendMagicLink} className="flex flex-col gap-5">
      <StField label="Email"><input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@business.com" disabled={status === "sending" || status === "google"} /></StField>
      <StPill type="submit" block busy={status === "sending"} disabled={status === "google"}>Email me a sign-in link</StPill>
    </form> : null}
    <StPill variant="soft" block onClick={() => void signInWithGoogle()} busy={status === "google"} disabled={status === "sending"}>Continue with Google</StPill>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </div>;
}
