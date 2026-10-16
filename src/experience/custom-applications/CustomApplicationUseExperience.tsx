"use client";

import { useCallback, useEffect, useState } from "react";
import { XaHeadline, XaPage, XaSystemTile } from "@/components/ui/strelva/Xa";
import { StandaloneApplicationShell } from "@/experience/applications/StandaloneApplicationShell";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import styles from "@/experience/applications/application-use.module.css";
import { ToolClosed, ToolOpening } from "@/experience/applications/ToolStates";
import { XaObjectPage } from "@/experience/xa-object/XaObjectPage";
import { CUSTOM_APPLICATION_PARENT_CSP, customApplicationSandboxHtml } from "@/products/custom-applications/client";

type UseState = "loading" | "ready" | "denied" | "error";
type Snapshot = { workId: string; title: string; releaseVersion: number; artifactDigest: string; html: string; grant: { expiresAt: string } };

function message(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error : fallback;
}

export function CustomApplicationUseExperience({ workId }: { workId: string }) {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<UseState>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await request(`/api/custom-applications/${encodeURIComponent(workId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(message(body, response.status === 401 ? "Sign in with a confirmed email to use this internal tool." : "This internal tool is unavailable."));
        setState(response.status === 401 || response.status === 403 ? "denied" : "error");
        return;
      }
      setSnapshot(body as Snapshot);
      setState("ready");
    } catch {
      setError("This internal tool could not be opened right now.");
      setState("error");
    }
  }, [request, workId]);

  // The effect starts the authenticated request; its state changes happen
  // from the request's completion handlers rather than during render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (state === "loading") return <ToolOpening />;
  if (state !== "ready" || !snapshot) {
    return <ToolClosed kind={state === "denied" ? "denied" : "error"} title={state === "denied" ? "This internal tool link is unavailable" : "Strelva could not open this internal tool"} message={error}
      onRetry={state === "error" ? () => { setState("loading"); setError(""); void load(); } : undefined} />;
  }

  const until = new Date(snapshot.grant.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return <>
    <meta httpEquiv="Content-Security-Policy" content={CUSTOM_APPLICATION_PARENT_CSP} />
    <StandaloneApplicationShell><XaObjectPage wide label={snapshot.title} story={<>
      <div className={styles.toolHead}>
        <XaSystemTile kind="form" size={48} label="Internal tool" />
        <XaHeadline size="sm" quiet={<>Release {snapshot.releaseVersion}. Your access lasts until <time dateTime={snapshot.grant.expiresAt}>{until}</time>.</>}>{snapshot.title}</XaHeadline>
      </div>
      <div data-artifact-digest={snapshot.artifactDigest}>
        <XaPage address={`${snapshot.title} · Release ${snapshot.releaseVersion}`} label={`${snapshot.title}, the released internal tool`}>
          <iframe
            title={`${snapshot.title} released internal tool`}
            srcDoc={customApplicationSandboxHtml(snapshot.html)}
            sandbox="allow-scripts allow-forms"
            className={styles.frame}
            referrerPolicy="no-referrer"
          />
        </XaPage>
      </div>
    </>} /></StandaloneApplicationShell>
  </>;
}
