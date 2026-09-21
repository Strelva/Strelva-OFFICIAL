"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CUSTOM_APPLICATION_PARENT_CSP, customApplicationSandboxHtml } from "@/products/custom-applications/client";

type UseState = "loading" | "ready" | "denied" | "error";
type Snapshot = { workId: string; title: string; releaseVersion: number; artifactDigest: string; html: string; grant: { expiresAt: string } };

function message(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error : fallback;
}

export function CustomApplicationUseExperience({ workId }: { workId: string }) {
  const [state, setState] = useState<UseState>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/custom-applications/${encodeURIComponent(workId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(message(body, response.status === 401 ? "Sign in with a confirmed email to use this custom application." : "This custom application is unavailable."));
        setState(response.status === 401 || response.status === 403 ? "denied" : "error");
        return;
      }
      setSnapshot(body as Snapshot);
      setState("ready");
    } catch {
      setError("This custom application could not be opened right now.");
      setState("error");
    }
  }, [workId]);

  // The effect starts the authenticated request; its state changes happen
  // from the request's completion handlers rather than during render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (state === "loading") return <main className="flex min-h-screen items-center justify-center bg-surface-base px-6 text-warm-black"><p role="status" className="text-sm text-gray-muted">Opening application…</p></main>;
  if (state !== "ready" || !snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-base px-6 text-warm-black">
        <section className="w-full max-w-lg rounded-2xl border border-gray-border bg-surface p-6 shadow-sm" aria-labelledby="custom-application-error-heading">
          <h1 id="custom-application-error-heading" className="font-display text-2xl font-medium">Custom application unavailable</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-gray-fg">{error}</p>
          {state === "error" ? <Button type="button" variant="secondary" onClick={() => { setState("loading"); setError(""); void load(); }} className="mt-5">Try again</Button> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      <meta httpEquiv="Content-Security-Policy" content={CUSTOM_APPLICATION_PARENT_CSP} />
      <main className="min-h-screen bg-surface-base px-4 py-6 text-warm-black sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-gray-muted">Released custom application · v{snapshot.releaseVersion}</p>
            <h1 className="mt-2 font-display text-3xl font-medium leading-tight sm:text-4xl">{snapshot.title}</h1>
          </div>
          <p className="text-xs text-gray-muted">Access expires {new Date(snapshot.grant.expiresAt).toLocaleString()}</p>
        </header>
        <section className="overflow-hidden rounded-2xl border border-gray-border bg-white shadow-sm" aria-label={`${snapshot.title} released application`}>
          <iframe
            title={`${snapshot.title} released application`}
            srcDoc={customApplicationSandboxHtml(snapshot.html)}
            sandbox="allow-scripts allow-forms"
            className="min-h-[70vh] w-full bg-white"
            referrerPolicy="no-referrer"
          />
        </section>
        <p className="break-all text-xs text-gray-muted">Reviewed artifact {snapshot.artifactDigest}</p>
        </div>
      </main>
    </>
  );
}
