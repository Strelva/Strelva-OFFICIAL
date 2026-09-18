"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ApplicationUseRenderer,
  type ApplicationUseDraft,
} from "@/experience/applications/ApplicationUseRenderer";
import type { ApplicationUseSnapshot } from "@/products/applications/client";

type LoadState = "loading" | "ready" | "denied" | "error";

function token(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyDraft(): ApplicationUseDraft {
  return { values: {}, recordId: token(), idempotencyKey: token() };
}

function errorMessage(response: Response, body: unknown, fallback: string): string {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    const detail = (body as { error: string }).error;
    return response.status >= 500 ? `${detail} Your current draft is still here.` : detail;
  }
  if (response.status === 401) return "Sign in with a confirmed email to use this application.";
  if (response.status === 403) return "This application link is no longer available to your account.";
  if (response.status === 409) return "This application changed. Reload and try again.";
  return fallback;
}

function responseDetail(body: unknown): string | undefined {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : undefined;
}

function ErrorSurface({ kind, message, onRetry, signInHref }: { kind: "denied" | "error"; message: string; onRetry?: () => void; signInHref?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-base px-4 py-12 text-warm-black">
      <section aria-labelledby="application-use-error-heading" className="w-full max-w-lg rounded-2xl border border-gray-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 id="application-use-error-heading" className="mt-3 font-display text-2xl font-medium">{kind === "denied" ? "This application link is unavailable" : "We could not open this application"}</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-gray-fg">{message}</p>
        {signInHref ? <a href={signInHref} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent/85">Sign in</a> : null}
        {kind === "denied" && !signInHref ? <p className="mt-4 text-sm leading-6 text-gray-muted">Ask the person who sent this link to issue a new one if you still need access.</p> : null}
        {onRetry ? <Button type="button" className="mt-6" variant="secondary" onClick={onRetry}>Try again</Button> : null}
      </section>
    </main>
  );
}

export function ApplicationUseExperience({ workId }: { workId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<ApplicationUseSnapshot | null>(null);
  const [draft, setDraft] = useState<ApplicationUseDraft>(() => emptyDraft());
  const [message, setMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deniedMessage, setDeniedMessage] = useState("This application link is no longer available to your account.");
  const [signInHref, setSignInHref] = useState<string | undefined>();
  const [canReload, setCanReload] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setSubmitError(null);
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(workId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      let body: unknown = null;
      try { body = await response.json(); } catch { /* a status still gives the user a recovery path */ }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setDraft(emptyDraft());
          setDeniedMessage(response.status === 401 ? "Sign in with a confirmed email to use this application." : responseDetail(body) ?? "This application link is no longer available to your account.");
          setSignInHref(response.status === 401 ? `/sign-in?next=${encodeURIComponent(`/apps/${workId}`)}` : undefined);
        }
        setState(response.status === 401 || response.status === 403 ? "denied" : "error");
        return;
      }
      setSnapshot(body as ApplicationUseSnapshot);
      setState("ready");
      setSignInHref(undefined);
    } catch {
      setState("error");
    }
  }, [workId]);

  useEffect(() => {
    void load();
  }, [load, workId]);

  const updateDraft = useCallback((next: ApplicationUseDraft) => {
    setDraft(next);
  }, []);

  const submit = useCallback(async (currentDraft: ApplicationUseDraft) => {
    if (!snapshot || busy) return;
    setBusy(true);
    setSubmitError(null);
    setMessage(null);
    setCanReload(false);
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(workId)}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          input: {
            record: { id: currentDraft.recordId, values: currentDraft.values },
            releaseVersion: snapshot.releaseVersion,
            idempotencyKey: currentDraft.idempotencyKey,
          },
        }),
      });
      let body: unknown = null;
      try { body = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        if (response.status === 403) {
          // Re-read before rendering again. A revoke must remove stale records
          // from the browser even when it races a submit request.
          const refreshed = await fetch(`/api/apps/${encodeURIComponent(workId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
          if (!refreshed.ok && (refreshed.status === 401 || refreshed.status === 403)) {
            setSnapshot(null);
            setDraft(emptyDraft());
            setDeniedMessage(refreshed.status === 401 ? "Sign in with a confirmed email to use this application." : "This application link is no longer available to your account.");
            setSignInHref(refreshed.status === 401 ? `/sign-in?next=${encodeURIComponent(`/apps/${workId}`)}` : undefined);
            setState("denied");
            return;
          }
        }
        if (response.status === 409) setCanReload(true);
        setSubmitError(errorMessage(response, body, "The record could not be submitted. Your current draft is still here."));
        return;
      }
      setSnapshot(body as ApplicationUseSnapshot);
      const next = emptyDraft();
      updateDraft(next);
      setMessage("Record submitted.");
    } catch {
      setSubmitError("The record could not be confirmed. Your current draft is still here.");
    } finally {
      setBusy(false);
    }
  }, [busy, snapshot, updateDraft, workId]);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-base px-4 py-12 text-warm-black">
        <p role="status" aria-live="polite" className="text-sm text-gray-muted">Opening application…</p>
      </main>
    );
  }
  if (state === "denied") return <ErrorSurface kind="denied" message={deniedMessage} signInHref={signInHref} />;
  if (state === "error" || !snapshot) return <ErrorSurface kind="error" message="This application could not be opened right now." onRetry={() => void load()} />;

  return (
    <main className="min-h-screen bg-surface-base text-warm-black">
      <ApplicationUseRenderer
        snapshot={snapshot}
        draft={draft}
        busy={busy}
        submitError={submitError}
        submitMessage={message}
        onReload={canReload ? () => void load() : undefined}
        onDraftChange={updateDraft}
        onSubmit={draftValue => void submit(draftValue)}
      />
    </main>
  );
}
