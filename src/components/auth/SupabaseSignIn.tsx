"use client";

/**
 * Supabase sign-in in the XA entry column. Email first (a code, or a link
 * while the hosted email carries only a link), Google second. Both land
 * on `next`: the link and Google through /auth/callback, the code through
 * /auth/code. Nothing here decides access; the destination still checks it.
 */

import { XaButton, XaButtonLink, XaField, XaHeadline, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaEntryNote, XaEntryStack } from "@/components/ui/strelva/xa/entry";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { signInCodeErrorCopy, signInErrorCopy } from "./sign-in-errors";
import { createBrowserSupabase } from "@/platform/infra/db/browser-client";
import { useSignInMail } from "./sign-in-mail";

/** Preview only: open in the sent or the failed state. */
export type SupabaseSignInInitial = { status: "sent" } | { error: string };

export function SupabaseSignIn({
  next = "/account",
  prefillEmail = "",
  heading,
  emailReady = false,
  codeReady = false,
  resume,
  initialStatus = "idle",
  emailLabel = "Email",
  initial,
}: {
  next?: string;
  prefillEmail?: string;
  heading?: ReactNode;
  emailReady?: boolean;
  /** The email carries a code as well as the link. Server-owned: authEmailCodeReady(). */
  codeReady?: boolean;
  /** Where the person lands after signing in, in plain words ("your invitation to Harbor Dental"). */
  resume?: ReactNode;
  /** Preview fixtures only: open on the sent step. */
  initialStatus?: "idle" | "sent";
  /** "Work email" on the business and agency doors. */
  emailLabel?: string;
  /** Preview fixtures only: open in the sent or the failed state. Nothing is sent. */
  initial?: SupabaseSignInInitial;
}) {
  // Shared with the felt's email when SignInMailProvider wraps the page.
  const { email, setEmail, status, setStatus } = useSignInMail(prefillEmail, initial ? "status" in initial ? "sent" : "error" : initialStatus);
  const [error, setError] = useState<string | null>(initial && "error" in initial ? initial.error : null);
  const [resent, setResent] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const lastTried = useRef("");

  useEffect(() => {
    if (status !== "sent") return;
    (codeReady ? codeRef.current : headRef.current)?.focus();
  }, [status, codeReady]);

  function redirectTo() {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function signInWithGoogle() {
    const supabase = createBrowserSupabase();
    if (!supabase) return fail("Sign-in is not set up here yet.");
    setStatus("google");
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
      if (error) fail(signInErrorCopy(error, "google"));
    } catch { fail("Sign-in is unavailable just now. Try again."); }
  }

  async function sendEmail(event?: FormEvent) {
    event?.preventDefault();
    if (!emailReady) return;
    const supabase = createBrowserSupabase();
    if (!supabase) return fail("Sign-in is not set up here yet.");
    const again = status === "sent";
    setStatus("sending"); setError(null); setCodeError(null); setCode(""); lastTried.current = "";
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
      if (error) fail(signInErrorCopy(error, "email"));
      else { setStatus("sent"); setResent(again); }
    } catch { fail(codeReady ? "The code could not be sent. Try again." : "The sign-in link could not be sent. Try again."); }
  }

  async function verify(value = code) {
    const token = value.replace(/\s+/g, "");
    if (verifying || token.length < 6 || token === lastTried.current) return;
    lastTried.current = token;
    setVerifying(true); setCodeError(null);
    try {
      const response = await fetch("/auth/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: token, next }) });
      const body = await response.json().catch(() => null) as { ok?: boolean; next?: string; reason?: string } | null;
      if (response.ok && body?.ok && typeof body.next === "string") { window.location.assign(body.next); return; }
      setCodeError(signInCodeErrorCopy(body?.reason));
    } catch { setCodeError(signInCodeErrorCopy("unavailable")); }
    setVerifying(false);
    codeRef.current?.focus();
  }

  function fail(message: string) {
    setError(message);
    setStatus("error");
  }

  if (status === "sent") return <XaEntryStack>
    <XaHeadline ref={headRef} quiet={<>We sent {codeReady ? "a code" : "a sign-in link"} to <span data-sent-to>{email}</span>.</>}>Check your email.</XaHeadline>
    {codeReady ? <form className="contents" onSubmit={event => { event.preventDefault(); void verify(); }}>
      <XaEntryStack gap="sm">
        <XaField ref={codeRef} label="Code from the email" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required
          value={code} disabled={verifying} error={codeError ?? undefined} hint={codeError ? undefined : "Six digits, from the newest email."} placeholder="000000"
          data-code-field style={{ fontSize: 24, letterSpacing: "0.32em", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}
          onChange={event => { const digits = event.target.value.replace(/\D/g, "").slice(0, 10); setCode(digits); setCodeError(null); if (digits.length === 6) void verify(digits); }} />
        <XaButton type="submit" variant="primary" size="lg" block busy={verifying}>Sign in</XaButton>
      </XaEntryStack>
    </form> : <XaEntryNote>Open the link in that email on this device. It signs you in{resume ? <> and takes you to {resume}</> : null}.</XaEntryNote>}
    <div className="flex flex-wrap gap-2">
      <XaButtonLink href="https://mail.google.com" variant="secondary" size="sm" target="_blank" rel="noopener noreferrer">Open Gmail</XaButtonLink>
      <XaButtonLink href="https://outlook.live.com/mail" variant="secondary" size="sm" target="_blank" rel="noopener noreferrer">Open Outlook</XaButtonLink>
    </div>
    <XaEntryNote role="status">{resent ? "Sent again. Use the newest email. " : "Nothing there after a minute? Check spam, then "}<XaTextLink onClick={() => void sendEmail()}>{codeReady ? "send a new code" : "send a new link"}</XaTextLink> · <XaTextLink onClick={() => { setEmail(""); setStatus("idle"); setResent(false); }}>use a different email</XaTextLink></XaEntryNote>
  </XaEntryStack>;

  return <XaEntryStack>
    {heading}
    {emailReady ? <form onSubmit={sendEmail} className="contents">
      <XaEntryStack gap="sm">
        <XaField label={emailLabel} type="email" name="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@yourbusiness.com" disabled={status === "sending" || status === "google"} />
        <XaButton type="submit" variant="primary" size="lg" block busy={status === "sending"} disabled={status === "google"}>{codeReady ? "Email me a code" : "Email me a sign-in link"}</XaButton>
      </XaEntryStack>
    </form> : null}
    <XaButton variant={emailReady ? "secondary" : "primary"} size="lg" block onClick={() => void signInWithGoogle()} busy={status === "google"} disabled={status === "sending"}>Continue with Google</XaButton>
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
    {resume ? <XaEntryNote>After you sign in, you go straight to {resume}.</XaEntryNote> : null}
  </XaEntryStack>;
}
