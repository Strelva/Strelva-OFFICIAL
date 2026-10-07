"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SiteDocumentTry, type SiteDocument } from "@/products/websites/client";

export interface PossibilityTryView {
  title: string;
  intent: string;
  /** What each changed System would become, in plain words. */
  changes: string[];
  /** New Systems it would add. */
  introduces: string[];
  /** Whether the candidate takes submissions (a form or a booking page). */
  takesSubmissions: boolean;
  websiteDocument?: SiteDocument;
}

export type PossibilityTryState =
  | { kind: "ready"; view: PossibilityTryView }
  | { kind: "expired" }
  | { kind: "changed" };

/**
 * "Try it" for an owner who never signs in. Shows only the candidate. Any
 * submission is a test: it goes nowhere and says so (spec behaviors 19-20).
 */
export function PossibilityTry({ state }: { state: PossibilityTryState }) {
  if (state.kind === "expired") return <Shell><h1 className="font-display text-2xl">This link has expired.</h1><p className="mt-3 text-sm text-gray-muted">Links in Strelva&apos;s emails last 14 days. The next email has a fresh one. Nothing changed.</p></Shell>;
  if (state.kind === "changed") return <Shell><h1 className="font-display text-2xl">This changed since we emailed you.</h1><p className="mt-3 text-sm text-gray-muted">Strelva is refreshing it. The latest version comes in the next email. Nothing live changed.</p></Shell>;
  const { view } = state;
  return <Shell>
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-muted">Try it · not live</p>
    <h1 className="mt-2 font-display text-2xl">{view.title}</h1>
    <p className="mt-3 text-sm">{view.intent}</p>
    {view.changes.length || view.introduces.length ? <section className="mt-6" aria-labelledby="try-changes">
      <h2 id="try-changes" className="text-sm font-semibold">What it would change</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {view.changes.map((line) => <li key={line}>{line}</li>)}
        {view.introduces.map((line) => <li key={`new-${line}`}>New: {line}</li>)}
      </ul>
    </section> : null}
    {view.websiteDocument ? <div className="mt-6"><SiteDocumentTry document={view.websiteDocument} /></div> : null}
    {view.takesSubmissions && !view.websiteDocument ? <TestSubmission /> : null}
    <p className="mt-8 text-xs text-gray-muted">Nothing here changes your live site, sends a message or books anything. Make it live from the email when you are ready.</p>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div data-dashboard className="min-h-screen bg-surface-base text-gray-fg"><main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">{children}</main></div>;
}

function TestSubmission() {
  const [sent, setSent] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }
  return <section className="mt-6 rounded-lg border border-gray-border p-4" aria-labelledby="try-form">
    <h2 id="try-form" className="text-sm font-semibold">Try it as a visitor</h2>
    {sent
      ? <p role="status" className="mt-3 text-sm">Test submission, nobody was told. It is not kept as a real record.</p>
      : <form className="mt-3 space-y-3" onSubmit={submit}>
        <label className="block text-sm">Name<input name="name" autoComplete="off" className="mt-1 block w-full rounded border border-gray-border bg-surface-inset px-3 py-2 text-gray-fg" /></label>
        <label className="block text-sm">Email<input name="email" type="email" autoComplete="off" className="mt-1 block w-full rounded border border-gray-border bg-surface-inset px-3 py-2 text-gray-fg" /></label>
        <label className="block text-sm">Message<textarea name="message" rows={3} className="mt-1 block w-full rounded border border-gray-border bg-surface-inset px-3 py-2 text-gray-fg" /></label>
        <Button type="submit" size="sm">Send a test</Button>
        <p className="text-xs text-gray-muted">This is a test. It goes nowhere.</p>
      </form>}
  </section>;
}
