"use client";

import { useCallback, useEffect, useState } from "react";
import { StEmpty, StHead, StNotice, StPage, StPill, StPillLink, StSkeleton } from "@/components/ui/strelva/Kit";
import { StandaloneApplicationShell } from "./StandaloneApplicationShell";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
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

function errorMessage(response: Response, body: unknown, fallback: string, editing: boolean): string {
  if (response.status === 409) return editing
    ? "That record changed. Your correction is still here. Reload before trying again."
    : "This application changed. Your current draft is still here. Reload before trying again.";
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    const detail = (body as { error: string }).error;
    return response.status >= 500 ? `${detail} Your current draft is still here.` : detail;
  }
  if (response.status === 401) return "Sign in with a confirmed email to use this application.";
  if (response.status === 403) return "This application link is no longer available to your account.";
  return fallback;
}

function responseDetail(body: unknown): string | undefined {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : undefined;
}

function ErrorSurface({ kind, message, onRetry, signInHref }: { kind: "denied" | "error"; message: string; onRetry?: () => void; signInHref?: string }) {
  return <StandaloneApplicationShell><StPage>
    <StHead title={kind === "denied" ? "This application link is unavailable" : "Strelva could not open this application"} />
    <div role="alert"><StNotice tone={kind === "denied" ? "need" : "critical"}>{message}</StNotice></div>
    {signInHref ? <div><StPillLink href={signInHref}>Sign in</StPillLink></div> : null}
    {kind === "denied" && !signInHref ? <StEmpty>Ask the person who sent this link to issue a new one if you still need access.</StEmpty> : null}
    {onRetry ? <div><StPill variant="soft" onClick={onRetry}>Try again</StPill></div> : null}
  </StPage></StandaloneApplicationShell>;
}

export function ApplicationUseExperience({ workId }: { workId: string }) {
  const request = useWorkspaceRequest();
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
      const response = await request(`/api/apps/${encodeURIComponent(workId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
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
  }, [request, workId]);

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
      const response = await request(`/api/apps/${encodeURIComponent(workId)}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: currentDraft.expectedRecordRevision !== undefined && currentDraft.editingRecordId === currentDraft.recordId ? "edit" : "submit",
          input: {
            record: { id: currentDraft.recordId, values: currentDraft.values },
            releaseVersion: snapshot.releaseVersion,
            idempotencyKey: currentDraft.idempotencyKey,
            ...(currentDraft.expectedRecordRevision !== undefined ? { expectedRecordRevision: currentDraft.expectedRecordRevision } : {}),
          },
        }),
      });
      let body: unknown = null;
      try { body = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        if (response.status === 403) {
          // Re-read before rendering again. A revoke must remove stale records
          // from the browser even when it races a submit request.
          const refreshed = await request(`/api/apps/${encodeURIComponent(workId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
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
        setSubmitError(errorMessage(
          response,
          body,
          "The record could not be submitted. Your current draft is still here.",
          currentDraft.expectedRecordRevision !== undefined && currentDraft.editingRecordId === currentDraft.recordId,
        ));
        return;
      }
      setSnapshot(body as ApplicationUseSnapshot);
      const wasEditing = currentDraft.expectedRecordRevision !== undefined && currentDraft.editingRecordId === currentDraft.recordId;
      const next = emptyDraft();
      updateDraft(next);
      setMessage(wasEditing ? "Correction saved." : "Record submitted.");
    } catch {
      setSubmitError("The record could not be confirmed. Your current draft is still here.");
    } finally {
      setBusy(false);
    }
  }, [busy, request, snapshot, updateDraft, workId]);

  if (state === "loading") {
    return <StandaloneApplicationShell><StPage><StHead title="Opening application…" /><StSkeleton label="Opening application" /><StSkeleton width="60%" /></StPage></StandaloneApplicationShell>;
  }
  if (state === "denied") return <ErrorSurface kind="denied" message={deniedMessage} signInHref={signInHref} />;
  if (state === "error" || !snapshot) return <ErrorSurface kind="error" message="This application could not be opened right now." onRetry={() => void load()} />;

  return (
    <StandaloneApplicationShell>
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
    </StandaloneApplicationShell>
  );
}
