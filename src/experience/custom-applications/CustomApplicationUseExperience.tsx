"use client";

import { useCallback, useEffect, useState } from "react";
import { StandaloneApplicationShell } from "@/experience/applications/StandaloneApplicationShell";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import styles from "@/experience/applications/application-use.module.css";
import { ToolClosed, ToolOpening } from "@/experience/applications/ToolStates";
import { CUSTOM_APPLICATION_PARENT_CSP, customApplicationSandboxHtml } from "@/products/custom-applications/client";

type UseState = "loading" | "ready" | "denied" | "error";
type Snapshot = { workId: string; title: string; releaseVersion: number; artifactDigest: string; html: string; grant: { expiresAt: string }; businessName?: string | null };

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
  // The tool is the page: its own heading is the one title. The frame grows to the tool's height.
  return <>
    <meta httpEquiv="Content-Security-Policy" content={CUSTOM_APPLICATION_PARENT_CSP} />
    <StandaloneApplicationShell from={snapshot.businessName ?? undefined} meta={<>Release {snapshot.releaseVersion} · Yours until <time dateTime={snapshot.grant.expiresAt}>{until}</time></>}>
      <div className={styles.toolFrame} data-artifact-digest={snapshot.artifactDigest}>
        <iframe
          title={snapshot.title}
          srcDoc={customApplicationSandboxHtml(snapshot.html)}
          sandbox="allow-scripts allow-forms"
          className={styles.frame}
          referrerPolicy="no-referrer"
          onLoad={event => fit(event.currentTarget)}
        />
      </div>
    </StandaloneApplicationShell>
  </>;
}

/**
 * Size the frame to the tool. The sandbox has no same-origin access, so the
 * height can't always be read; then the frame keeps a calm default height.
 */
function fit(frame: HTMLIFrameElement) {
  try {
    const height = frame.contentDocument?.documentElement.scrollHeight;
    if (height && height > 0) frame.style.height = `${Math.min(Math.max(height, 240), 4000)}px`;
  } catch { /* cross-origin sandbox: keep the default height */ }
}
