"use client";
import { useCallback, useRef, useState } from "react";
import { AssistantConnections } from "@/experience/workspace/AssistantConnections";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const workspaceId = "00000000-0000-4000-8000-000000000010";
export function ConnectionPreview({ mode }: { mode: string }) {
  const [disconnected, setDisconnected] = useState(false);
  const state = useRef({ disconnected: false, failedRead: false });
  const request = useCallback<typeof fetch>(async (_input, init) => {
    await new Promise(resolve => setTimeout(resolve, mode === "loading" ? 120000 : 300));
    if (mode === "error" || mode === "disconnect-error" && init?.method === "DELETE") return Response.json({ error: "Fixture failure" }, { status: 503 });
    if (init?.method === "DELETE") { state.current.disconnected = true; setDisconnected(true); return Response.json({ disconnected: true }); }
    if (mode === "refresh-error" && state.current.disconnected && !state.current.failedRead) { state.current.failedRead = true; return Response.json({}, { status: 503 }); }
    return Response.json({ connections: mode === "empty" ? [] : [{
      id: "00000000-0000-4000-8000-000000000011", clientId: "https://assistant.example.test/client-metadata.json",
      clientName: "Fictional consulting assistant with a longer display name", scopes: ["business:read", "website:read", "website:propose"],
      createdAt: "2026-10-08T12:00:00Z", expiresAt: "2026-11-07T12:00:00Z", lastUsedAt: null,
      revokedAt: state.current.disconnected ? "2026-10-08T13:00:00Z" : null, agencyId: null,
      status: state.current.disconnected ? "revoked" : mode === "expired" ? "expired" : mode === "authority_removed" ? "authority_removed" : "active",
    }] });
  }, [mode]);
  return <WorkspaceRequestContext.Provider value={request}><AssistantConnections workspaceId={workspaceId} canManage={mode !== "permission"} />{disconnected && <p className="sr-only" role="status">Fictional fixture disconnected.</p>}</WorkspaceRequestContext.Provider>;
}
