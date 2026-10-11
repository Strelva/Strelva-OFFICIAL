"use client";

import { useCallback, useEffect, useState } from "react";
import { StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StSurface } from "@/components/ui/strelva/Kit";
import { StandaloneApplicationShell } from "@/experience/applications/StandaloneApplicationShell";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import styles from "@/experience/applications/standalone-application.module.css";
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

  if (state === "loading") return <StandaloneApplicationShell><StPage><StHead title="Opening internal tool…" /><StSkeleton label="Opening internal tool" /><StSkeleton width="60%" /></StPage></StandaloneApplicationShell>;
  if (state !== "ready" || !snapshot) {
    return <StandaloneApplicationShell><StPage>
      <StHead title={state === "denied" ? "This internal tool link is unavailable" : "Strelva could not open this internal tool"} />
      <div role="alert"><StNotice tone={state === "denied" ? "need" : "critical"}>{error}</StNotice></div>
      {state === "error" ? <div><StPill variant="soft" onClick={() => { setState("loading"); setError(""); void load(); }}>Try again</StPill></div> : null}
    </StPage></StandaloneApplicationShell>;
  }

  return <>
    <meta httpEquiv="Content-Security-Policy" content={CUSTOM_APPLICATION_PARENT_CSP} />
    <StandaloneApplicationShell><StPage>
      <StHead title={snapshot.title} meta={<><StState kind="live">Live</StState> · release <StMono>{snapshot.releaseVersion}</StMono> · internal tool</>} />
      <StSurface pad={false}>
        <iframe
          title={`${snapshot.title} released internal tool`}
          srcDoc={customApplicationSandboxHtml(snapshot.html)}
          sandbox="allow-scripts allow-forms"
          className={styles.applicationFrame}
          referrerPolicy="no-referrer"
        />
      </StSurface>
      <StSection title="Access and checks"><StRows>
        <StRow title="Access expires" value={<StMono as="time" dateTime={snapshot.grant.expiresAt}>{new Date(snapshot.grant.expiresAt).toLocaleString()}</StMono>} />
        <StRow title="Reviewed artifact" value={<StMono>{snapshot.artifactDigest}</StMono>} />
      </StRows></StSection>
    </StPage></StandaloneApplicationShell>
  </>;
}
