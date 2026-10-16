"use client";

import { useState } from "react";
import Link from "next/link";
import { XaButton, XaSays, XaSegmented, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { useDashboard } from "./DashboardContext";

type RequestKind = "custom_design" | "template" | "infrastructure";

const REQUEST_KIND_OPTIONS: Array<{ value: RequestKind; label: string }> = [
  { value: "custom_design", label: "How it looks" },
  { value: "template", label: "A new page" },
  { value: "infrastructure", label: "Something it does" },
];

export function CustomChangeRequestPanel() {
  const { selectedNode, activeSection, activePage, dashboardHref, readOnly } = useDashboard();
  const [prompt, setPrompt] = useState("");
  const [requestKind, setRequestKind] = useState<RequestKind>("custom_design");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const section = selectedNode?.section || activeSection || undefined;
  const label = selectedNode?.label || section || activePage;

  async function submitRequest() {
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(false);
    setErrorMessage(null);
    try {
      const res = await fetch(dashboardHref("/api/change-requests"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          prompt,
          requestKind,
          page: activePage,
          section,
          field: selectedNode?.field,
          label,
          nodeType: selectedNode?.nodeType,
          rect: selectedNode?.rect,
        }),
      });
      if (!res.ok) {
        // The one-active-request wall returns 409 with a friendly message that
        // names what's already in flight — surface that instead of the generic
        // "try again" so the owner knows why this didn't go through.
        if (res.status === 409) {
          const body = await res.json().catch(() => null);
          const title =
            body && typeof body.activeRequest?.title === "string"
              ? body.activeRequest.title
              : null;
          const message =
            body && typeof body.message === "string"
              ? body.message
              : "You already have a custom request in progress.";
          setErrorMessage(title ? `${message} (in progress: "${title}")` : message);
          setError(true);
          setTimeout(() => setError(false), 8000);
          return;
        }
        throw new Error("Request failed");
      }
      setPrompt("");
      setSent(true);
    } catch {
      setError(true);
      setErrorMessage(null);
      setTimeout(() => setError(false), 4000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-[var(--st-surface)] p-5">
      <XaSays>Bigger changes, like new layouts, motion or something your site doesn&apos;t do yet, go to Strelva Agency as a Request. They are quoted before any work starts, apart from your monthly plan.</XaSays>
      <p className="m-0 text-[14px] text-[var(--st-text-2)]">About: <span className="font-medium text-[var(--st-text)]">{label || "This page"}</span></p>
      <XaSegmented label="What kind of change" value={requestKind} onChange={setRequestKind} options={REQUEST_KIND_OPTIONS} block />
      {sent ? (
        <div role="status">
          <XaSays links={[<XaTextLink key="again" onClick={() => setSent(false)}>Ask for another</XaTextLink>]}>Strelva Agency has your Request. They reply with a quote; you can follow it in History meanwhile.</XaSays>
        </div>
      ) : (
        <>
          <XaTextArea label="What should change?" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={6}
            placeholder="For example: a booking calendar on the homepage, like the one on our Google listing."
            error={error ? errorMessage ?? "That didn't send. Nothing was lost; try again." : undefined} />
          {readOnly ? (
            <p className="m-0 text-[14px] text-[var(--st-text-2)]">This is a demo you can look around. <Link href="/access-request" className="font-medium text-[var(--st-accent)] hover:underline">Get your own site to send Requests</Link></p>
          ) : (
            <div><XaButton busy={submitting} disabled={!prompt.trim()} onClick={submitRequest}>{submitting ? "Sending" : "Send to Strelva Agency"}</XaButton></div>
          )}
        </>
      )}
    </div>
  );
}
