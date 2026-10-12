"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StCopy, StEntry, StField, StHead, StMono, StNotice, StPill, StPillLink, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";

type FormState = "idle" | "submitting" | "success" | "error";

const requestOptions = [
  "Launch a simple site",
  "Get more booking clicks",
  "Replace an outdated site",
  "Make updates easier",
];

const planOptions = [
  { value: "", label: "Not sure yet" },
  { value: "one-time", label: "One-time build" },
  { value: "monthly", label: "Monthly plan" },
] as const;

const nextSteps = [
  "Strelva Agency reviews your business and site request.",
  "Scope and timing are agreed after review.",
  "Nothing publishes without your review.",
];

type InitialFeedback = { state: FormState; message?: string; email?: string; statusUrl?: string };
/** Carried over from the check the person just ran (owner door), never typed twice. */
type Carried = { businessName?: string; currentWebsite?: string };

export function AccessRequestPage({ initialFeedback, carried }: { initialFeedback?: InitialFeedback; carried?: Carried } = {}) {
  return (
    <Suspense fallback={<StEntry><StSkeleton label="Loading request form" /></StEntry>}>
      <AccessRequestForm initialFeedback={initialFeedback} carried={carried} />
    </Suspense>
  );
}

function AccessRequestForm({ initialFeedback, carried }: { initialFeedback?: InitialFeedback; carried?: Carried }) {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") || "";
  const [agencyServiceChosen, setAgencyServiceChosen] = useState(Boolean(initialFeedback));
  const [businessName, setBusinessName] = useState(carried?.businessName || "");
  const [email, setEmail] = useState(initialFeedback?.email || "");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [currentWebsite, setCurrentWebsite] = useState(carried?.currentWebsite || "");
  const [plan, setPlan] = useState("");
  const [request, setRequest] = useState("");
  const [state, setState] = useState<FormState>(initialFeedback?.state || "idle");
  const [message, setMessage] = useState(initialFeedback?.message || "");
  const [statusUrl, setStatusUrl] = useState(initialFeedback?.statusUrl || "");
  const heading = useRef<HTMLDivElement>(null);
  const view = !agencyServiceChosen ? "choice" : state === "success" ? "confirmation" : "service";
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    heading.current?.focus();
  }, [view]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;

    const cleanBusinessName = businessName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanLocation = location.trim();
    const cleanWebsite = currentWebsite.trim();
    const cleanRequest = request.trim();

    if (!cleanBusinessName || !cleanEmail) {
      setState("error");
      setMessage("Add your business and email.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setState("error");
      setMessage("Use a working email.");
      return;
    }

    setState("submitting");
    setMessage("");
    setStatusUrl("");

    try {
      const response = await fetch("/api/access-request/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: "agency_service",
          businessName: cleanBusinessName,
          email: cleanEmail,
          phone: cleanPhone,
          currentWebsite: cleanWebsite,
          plan,
          description: cleanRequest ? `Build request: ${cleanRequest}` : "Build request.",
          location: cleanLocation,
          referredBy: ref || "access-request",
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "We could not send this yet. Try again.");
      }

      const body = await response.json().catch(() => null);
      setState("success");
      const rawStatusUrl = typeof body?.statusUrl === "string" ? body.statusUrl : "";
      // Only accept relative paths (starting with '/') or same-origin URLs to
      // prevent an open-redirect if the API response is ever tampered with.
      const isSafeStatusUrl = rawStatusUrl.startsWith("/") ||
        (rawStatusUrl.startsWith("http") && (() => {
          try {
            return new URL(rawStatusUrl).origin === window.location.origin;
          } catch {
            return false;
          }
        })());
      setStatusUrl(isSafeStatusUrl ? rawStatusUrl : "");
      if (body?.repeatSubmission) {
        setMessage(
          body?.emailSent
            ? "We already have this email in the queue, one site at a time. We resent your delivery-status link."
            : "We already have this email in the queue, one site at a time. Your delivery-status link is ready.",
        );
      } else {
        setMessage(
          body?.emailSent
            ? "Request received. We emailed your delivery-status link and will follow up after review."
            : "Request received. Your delivery-status link is ready. We will follow up after review.",
        );
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "We could not send this yet. Try again.");
    }
  }

  if (!agencyServiceChosen) return <StEntry>
    <div ref={heading} tabIndex={-1}><StHead title="What do you need?" meta="Open your platform account or choose an agency to do the work." /></div>
    <StSection title="Use Strelva"><StRows>
      <StRow title="Open my business account" detail="Run your business yourself. Bring in an agency anytime." href="/sign-up" />
      <StRow title="Open my agency account" detail="Build and run systems for your clients." href="/sign-up?as=agency" />
    </StRows></StSection>
    <StSection title="Have an agency do it"><StRows>
      <StRow title="Find an agency" detail="Choose from the agency directory." href="/agencies" />
      <StRow title="Ask Strelva Agency to do it for you" detail="Strelva Agency · Runs on Strelva. Request a website build." onClick={() => setAgencyServiceChosen(true)} />
    </StRows></StSection>
    <StTextButton href="/sign-in">Already have an account? Sign in</StTextButton>
  </StEntry>;

  return <StEntry>
    <p className="text-sm text-gray-muted">Strelva Agency · Runs on Strelva</p>
    {state === "success" ? <>
      <div ref={heading} tabIndex={-1}><StHead title="Request received" /></div>
      <StState kind="live">Received</StState>
      <StCopy>{message}</StCopy>
      <StCopy muted>Request email: <StMono>{email.trim().toLowerCase()}</StMono></StCopy>
      {statusUrl ? <StPillLink href={statusUrl}>Track delivery status</StPillLink> : null}
      <StTextButton href="/">Back to launch page</StTextButton>
    </> : <>
      <div ref={heading} tabIndex={-1}><StHead title="Request your build" meta="Tell Strelva Agency about your business and what your website should help customers do." /></div>
      <StTextButton onClick={() => setAgencyServiceChosen(false)} disabled={state === "submitting"}>Choose another path</StTextButton>
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate aria-describedby={message ? "intake-status" : undefined} aria-busy={state === "submitting"}>
        <StField label="Business"><input id="business-name" value={businessName} onChange={event => setBusinessName(event.target.value)} autoComplete="organization" required /></StField>
        <StField label="City"><input id="location" value={location} onChange={event => setLocation(event.target.value)} autoComplete="address-level2" /></StField>
        <StField label="Email"><input id="email" value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" required /></StField>
        <StField label="Phone (optional)"><input id="phone" value={phone} onChange={event => setPhone(event.target.value)} type="tel" autoComplete="tel" inputMode="tel" /></StField>
        <StField label="Current site (optional)"><input id="current-website" value={currentWebsite} onChange={event => setCurrentWebsite(event.target.value)} autoComplete="url" inputMode="url" /></StField>
        <StField label="Which fits best?"><select id="plan" value={plan} onChange={event => setPlan(event.target.value)}>{planOptions.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}</select></StField>
        <StSection title="What should your site do?"><StRows label="Common site goals">{requestOptions.map(option => <StRow key={option} title={option} selected={request === option} onClick={() => setRequest(option)} />)}</StRows></StSection>
        <StField label="Site request"><textarea id="request" value={request} onChange={event => setRequest(event.target.value)} rows={4} /></StField>
        {message ? <div id="intake-status"><StNotice tone="critical">{message}</StNotice></div> : null}
        <StPill type="submit" block busy={state === "submitting"}>{state === "submitting" ? "Sending…" : "Request your build"}</StPill>
        <StCopy muted>A request becomes an agreed job once scope and timing are confirmed.</StCopy>
      </form>
      <StSection title="After this"><StRows>{nextSteps.map(step => <StRow key={step} title={step} />)}</StRows></StSection>
    </>}
  </StEntry>;
}
