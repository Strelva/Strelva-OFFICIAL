"use client";

/**
 * Scaffold Web native lead form for custom-repo client sites.
 *
 * Drop this file into a per-client repo and render <ScaffoldLeadForm /> anywhere
 * a "contact us / get a quote" form belongs. On submit it POSTs to the control
 * plane's public `/api/v1/leads/{tenant}` contract, so the owner's dashboard
 * shows real people under "Who reached out" — not anonymous clicks — with zero
 * hand-wiring per build.
 *
 * Self-contained on purpose: imports only React + standard browser APIs (no
 * `@/lib/...`), so it is a true single-file drop-in and typechecks inside this
 * control-plane repo as well as any client repo — the same contract
 * ScaffoldTracker / ScaffoldGA4 follow.
 *
 * Design rules (never risk the client site):
 *   - Fail soft. A network error or non-2xx response shows a friendly inline
 *     message and lets the visitor retry; it never throws or blanks the page.
 *   - Success state. On a 2xx the form is replaced with a thank-you message.
 *   - Honeypot. A hidden, off-screen field bots tend to fill; when it is
 *     non-empty we fake success and never POST (basic, dependency-free spam
 *     resistance — no captcha, no external calls).
 *   - No external deps. Plain React state + `fetch`; no form library, no captcha
 *     SDK. Style it with your own classes via the `className` props.
 *
 * PHONE FIELD NOTE: the v1 leads contract validates `name` (required), `email`,
 * `message`, and `source` — it has no top-level `phone`. To capture a phone
 * number without changing the shared contract, an entered phone is folded into
 * the `message` as a "Phone: ..." line (see `buildLeadPayload`), so it still
 * lands in "Who reached out". Turn the field off with `showPhone={false}`.
 *
 * Env (set in the client repo, browser-inlined by Next.js because they are
 * NEXT_PUBLIC_* vars — the same two the tracker uses):
 *   - NEXT_PUBLIC_TENANT_ID        the tenant slug (e.g. "gldf", "rohlax")
 *   - NEXT_PUBLIC_SCAFFOLD_API_URL https://app.strelva.com  (control plane)
 */

import { useState } from "react";
import type { FormEvent } from "react";

const CONTRACT_VERSION = "v1";

/** Browser-safe control-plane base URL — mirrors ScaffoldTracker's getBaseUrl. */
function getBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SCAFFOLD_API_URL;
  return url?.replace(/\/$/, "") || null;
}

/** Browser-safe tenant slug — mirrors ScaffoldTracker's getTenant. */
function getTenant(): string | null {
  return process.env.NEXT_PUBLIC_TENANT_ID || null;
}

/** Raw values collected from the form fields. */
export interface LeadFormValues {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
}

/** The exact body the `/api/v1/leads/{tenant}` contract validates. */
export interface LeadPayload {
  name: string;
  email?: string;
  message?: string;
  source: string;
}

export type LeadSubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Build the POST body from form values. The v1 contract has no `phone` field, so
 * a supplied phone is folded into `message` as a "Phone: ..." line — that keeps
 * the number visible in "Who reached out" without changing the shared route.
 * Pure + exported so it is unit-testable without a DOM.
 */
export function buildLeadPayload(values: LeadFormValues, source: string): LeadPayload {
  const name = values.name.trim();
  const email = values.email?.trim() || undefined;
  const phone = values.phone?.trim();
  const body = values.message?.trim();

  const parts: string[] = [];
  if (phone) parts.push(`Phone: ${phone}`);
  if (body) parts.push(body);
  const message = parts.length ? parts.join("\n\n") : undefined;

  const payload: LeadPayload = { name, source };
  if (email) payload.email = email;
  if (message) payload.message = message;
  return payload;
}

/**
 * POST a lead to the control plane. Never throws — returns a typed result so the
 * UI can show a friendly retry message. Reads base URL + tenant from env, or
 * accepts explicit overrides (used by tests). Returns a config error if the two
 * NEXT_PUBLIC_* vars are unset so the visitor isn't left staring at a dead form.
 */
export async function submitLead(
  values: LeadFormValues,
  opts?: { tenant?: string | null; baseUrl?: string | null; source?: string; errorMessage?: string },
): Promise<LeadSubmitResult> {
  const errorMessage =
    opts?.errorMessage ?? "Sorry, something went wrong sending your message. Please try again.";
  try {
    const baseUrl = opts?.baseUrl !== undefined ? opts.baseUrl : getBaseUrl();
    const tenant = opts?.tenant !== undefined ? opts.tenant : getTenant();
    if (!baseUrl || !tenant) return { ok: false, error: errorMessage };

    const payload = buildLeadPayload(values, opts?.source ?? "contact-form");
    const url = `${baseUrl}/api/${CONTRACT_VERSION}/leads/${tenant}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Public write-only beacon on another origin; never send credentials.
      credentials: "omit",
    });
    if (!res.ok) return { ok: false, error: errorMessage };
    return { ok: true };
  } catch {
    return { ok: false, error: errorMessage };
  }
}

export interface ScaffoldLeadFormProps {
  /** Where the lead came from — shows in the dashboard. Default "contact-form". */
  source?: string;
  /** Show the phone field (folded into the message). Default true. */
  showPhone?: boolean;
  /** Show the free-text message field. Default true. */
  showMessage?: boolean;
  /** Require an email address before submit. Default false. */
  requireEmail?: boolean;
  /** Field labels (each optional). */
  labels?: { name?: string; email?: string; phone?: string; message?: string };
  submitLabel?: string;
  /** Shown once after a successful submit. */
  successMessage?: string;
  /** Shown inline on a failed submit; the visitor can retry. */
  errorMessage?: string;
  /** Class hooks so you style it with the client site's own CSS. */
  className?: string;
  fieldClassName?: string;
  labelClassName?: string;
  buttonClassName?: string;
}

/**
 * A ready-to-drop contact/quote form. Captures name (required), optional email,
 * optional phone, and an optional message, and posts them to the v1 leads
 * contract. Fails soft, shows a success state, and includes a honeypot.
 */
export function ScaffoldLeadForm({
  source = "contact-form",
  showPhone = true,
  showMessage = true,
  requireEmail = false,
  labels,
  submitLabel = "Send",
  successMessage = "Thanks — we got your message and will be in touch shortly.",
  errorMessage = "Sorry, something went wrong sending your message. Please try again.",
  className,
  fieldClassName,
  labelClassName,
  buttonClassName,
}: ScaffoldLeadFormProps) {
  const [values, setValues] = useState<LeadFormValues>({ name: "", email: "", phone: "", message: "" });
  // Honeypot: a real user never fills this hidden field; a bot often does.
  const [botField, setBotField] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof LeadFormValues>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    // Honeypot tripped → pretend success, POST nothing. Bots think they won.
    if (botField.trim()) {
      setStatus("success");
      return;
    }
    if (!values.name.trim()) {
      setError("Please enter your name.");
      setStatus("error");
      return;
    }
    if (requireEmail && !values.email?.trim()) {
      setError("Please enter your email.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError(null);
    const result = await submitLead(values, { source, errorMessage });
    if (result.ok) {
      setStatus("success");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={className} role="status" aria-live="polite">
        <p>{successMessage}</p>
      </div>
    );
  }

  return (
    <form className={className} onSubmit={onSubmit} noValidate>
      <label className={labelClassName}>
        {labels?.name ?? "Name"}
        <input
          className={fieldClassName}
          type="text"
          name="name"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          required
          autoComplete="name"
        />
      </label>

      <label className={labelClassName}>
        {labels?.email ?? "Email"}
        <input
          className={fieldClassName}
          type="email"
          name="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          required={requireEmail}
          autoComplete="email"
        />
      </label>

      {showPhone && (
        <label className={labelClassName}>
          {labels?.phone ?? "Phone"}
          <input
            className={fieldClassName}
            type="tel"
            name="phone"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            autoComplete="tel"
          />
        </label>
      )}

      {showMessage && (
        <label className={labelClassName}>
          {labels?.message ?? "Message"}
          <textarea
            className={fieldClassName}
            name="message"
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
          />
        </label>
      )}

      {/* Honeypot — visually hidden, off the tab order, ignored by real users. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Company (leave this blank)
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={botField}
            onChange={(e) => setBotField(e.target.value)}
          />
        </label>
      </div>

      {status === "error" && error && (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <button className={buttonClassName} type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
