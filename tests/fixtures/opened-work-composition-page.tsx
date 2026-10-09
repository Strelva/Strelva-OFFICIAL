"use client";
// Copy to the disposable local proof route as documented in the stream handoff.
// Never imported by a deployed route. Only closed fictional responses.
import { useEffect, useState } from "react";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createOpenedWorkFixture, envelope, json } from "@/__tests__/fixtures/opened-work-composition";
export default function Proof() {
  const [request, setRequest] = useState<typeof fetch>();
  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    let current = envelope();
    const previous = window.fetch;
    let cancelled = false;
    void createOpenedWorkFixture(async () => { current = envelope(undefined, 2); return json(current); }, mode === "loading" ? () => new Promise<Response>(() => undefined) : mode === "error" || mode === "permission" ? async () => json({ error: mode === "permission" ? "Fictional permission refused." : "Fictional current read failed." }, mode === "permission" ? 403 : 503) : async () => json(current), mode === "read-only").then(({ request }) => {
      if (cancelled) return;
      window.fetch = request;
      setRequest(() => request);
    });
    return () => { cancelled = true; window.fetch = previous; };
  }, []);
  return <><p role="note">Disposable fictional proof — no Auth, provider or production actions</p>{request ? <WorkspaceApp request={request} /> : <p>Preparing fictional proof…</p>}</>;
}
