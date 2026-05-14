"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, MailCheck } from "lucide-react";

type FormState = "idle" | "submitting" | "success" | "error";

const requestOptions = [
  "Keep my site current",
  "Get more booking clicks",
  "Show what worked each week",
  "Make updates easier",
];

const nextSteps = [
  "We read the request and first workflow.",
  "We email the next step for the free site.",
  "Nothing publishes without your review.",
];

export function AccessRequestPage() {
  return (
    <Suspense>
      <AccessRequestForm />
    </Suspense>
  );
}

function AccessRequestForm() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") || "";
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [currentWebsite, setCurrentWebsite] = useState("");
  const [request, setRequest] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;

    const cleanBusinessName = businessName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanLocation = location.trim();
    const cleanWebsite = currentWebsite.trim();
    const cleanRequest = request.trim();

    if (!cleanBusinessName || !cleanEmail || !cleanRequest) {
      setState("error");
      setMessage("Add your business, email, and first workflow.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setState("error");
      setMessage("Use a working email.");
      return;
    }

    setState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/access-request/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: cleanBusinessName,
          email: cleanEmail,
          currentWebsite: cleanWebsite,
          description: `Free website waitlist. First workflow: ${cleanRequest}`,
          location: cleanLocation,
          referredBy: ref || "access-request",
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "We could not send this yet. Try again.");
      }

      setState("success");
      setMessage("Waitlist request received. We will email next steps.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "We could not send this yet. Try again.");
    }
  }

  return (
    <main className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1180px] content-center gap-8 pt-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:pt-0">
        <section className="motion-rise max-w-[620px]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
          >
            <ArrowLeft className="size-4" />
            Scaffold Web
          </Link>

          <p className="mt-12 text-[14px] font-medium text-[color:var(--m-text-3)]">
            Free website waitlist
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-[0.94] tracking-normal text-[color:var(--m-text)] sm:text-6xl md:text-7xl">
            Start with one workflow.
          </h1>
          <p className="mt-6 max-w-[560px] text-[17px] leading-[1.7] text-[color:var(--m-text-2)]">
            Tell us the business, the public site you need, and the first practical AI workflow you want handled.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label="Common first outcomes">
            {requestOptions.map((option, index) => (
              <button
                key={option}
                type="button"
                aria-pressed={request === option}
                className={`motion-item rounded-lg border px-4 py-3 text-left text-[14px] transition-colors ${
                  request === option
                    ? "border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[color:var(--m-text)]"
                    : "border-[var(--m-rule-soft)] bg-[var(--m-panel)] text-[color:var(--m-text-2)] hover:border-[var(--m-rule)] hover:text-[color:var(--m-text)]"
                }`}
                style={{ "--i": index } as React.CSSProperties}
                onClick={() => setRequest(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="mt-10 hidden rounded-[18px] border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-5 lg:block">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="size-5 text-[color:var(--m-accent)]" />
              <h2 className="text-[15px] font-medium text-[color:var(--m-text)]">After this</h2>
            </div>
            <ul className="mt-4 grid gap-3">
              {nextSteps.map((step) => (
                <li key={step} className="flex gap-3 text-[13px] leading-[1.55] text-[color:var(--m-text-2)]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--m-success)]" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="motion-rise overflow-hidden rounded-[28px] border border-[var(--m-rule)] bg-[var(--m-paper)] shadow-[0_34px_120px_oklch(4%_0.01_255_/_0.42)]" style={{ "--motion-delay": "120ms" } as React.CSSProperties}>
          {state === "success" ? (
            <div className="p-6 sm:p-8 md:p-10">
              <MailCheck className="size-9 text-[color:var(--m-success)]" />
              <h2 className="mt-6 text-3xl font-semibold tracking-normal text-[color:var(--m-text)]">
                Request received.
              </h2>
              <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[color:var(--m-text-2)]">
                We will email next steps for the free first site and the workflow you want to start with.
              </p>
              <p className="mt-6 text-[13px] text-[color:var(--m-text-3)]">
                Sent to {email.trim().toLowerCase()}
              </p>
              <Link
                href="/"
                className="marketing-button-primary mt-8 h-11 px-5 text-[14px]"
              >
                Back to launch page
              </Link>
            </div>
          ) : (
            <form className="grid gap-5 p-6 sm:p-8 md:p-10" onSubmit={onSubmit} noValidate aria-describedby="intake-status">
              <div className="border-b border-[var(--m-rule-soft)] pb-5">
                <p className="text-[13px] text-[color:var(--m-text-3)]">Takes one minute</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight text-[color:var(--m-text)]">
                  Join the waitlist.
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business" htmlFor="business-name">
                  <input
                    id="business-name"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    placeholder="Business name"
                    autoComplete="organization"
                    required
                    className={fieldClassName}
                  />
                </Field>

                <Field label="City" htmlFor="location">
                  <input
                    id="location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Buffalo, NY"
                    autoComplete="address-level2"
                    className={fieldClassName}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="email">
                  <input
                    id="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@business.com"
                    type="email"
                    autoComplete="email"
                    required
                    className={fieldClassName}
                  />
                </Field>

                <Field label="Current site" htmlFor="current-website">
                  <input
                    id="current-website"
                    value={currentWebsite}
                    onChange={(event) => setCurrentWebsite(event.target.value)}
                    placeholder="Website or booking page"
                    autoComplete="url"
                    inputMode="url"
                    className={fieldClassName}
                  />
                </Field>
              </div>

              <Field label="First workflow" htmlFor="request">
                <textarea
                  id="request"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Example: I need a current site, weekly proof, and easier updates for new classes."
                  required
                  className={`${fieldClassName} min-h-36 resize-none py-3 leading-[1.55]`}
                />
              </Field>

              <div className="flex flex-col gap-3 border-t border-[var(--m-rule-soft)] pt-5 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="marketing-button-primary h-13 px-6 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {state === "submitting" ? "Sending..." : "Join free-site waitlist"}
                  <ArrowRight className="size-4" />
                </button>
                <p className="text-[13px] leading-[1.5] text-[color:var(--m-text-3)]">
                  No payment. No long form.
                </p>
              </div>

              {message && (
                <p
                  id="intake-status"
                  aria-live="polite"
                  role={state === "error" ? "alert" : "status"}
                  className="rounded-lg border px-4 py-3 text-[13px]"
                  style={{
                    color: state === "error" ? "var(--m-danger)" : "var(--m-text-2)",
                    borderColor:
                      state === "error"
                        ? "color-mix(in oklch, var(--m-danger) 38%, transparent)"
                        : "var(--m-rule-soft)",
                    background:
                      state === "error"
                        ? "color-mix(in oklch, var(--m-danger) 10%, transparent)"
                        : "var(--m-panel)",
                  }}
                >
                  {message}
                </p>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

const fieldClassName =
  "h-13 w-full rounded-lg border border-[var(--m-rule)] bg-[var(--m-surface)] px-4 text-[15px] text-[color:var(--m-text)] outline-none transition-colors placeholder:text-[color:var(--m-text-3)] hover:border-[var(--m-rule)] focus:border-[var(--m-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--m-accent)] disabled:cursor-not-allowed disabled:opacity-65";

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-[color:var(--m-text-3)]">
        {label}
      </label>
      {children}
    </div>
  );
}
