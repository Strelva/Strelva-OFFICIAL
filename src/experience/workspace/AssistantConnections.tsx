"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState } from "@/components/ui/strelva/Kit";
import { useWorkspaceRequest } from "./WorkspaceRequest";

const connectionSchema = z.object({
  id: z.uuid(), clientId: z.string(), clientName: z.string(), scopes: z.array(z.string()),
  createdAt: z.string(), expiresAt: z.string(), lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(), agencyId: z.uuid().nullable(),
  status: z.enum(["active", "expired", "revoked", "authority_removed"]),
});
const responseSchema = z.object({ connections: z.array(connectionSchema) });
const permissionLabels: Record<string, string> = {
  "business:read": "Business facts and services", "website:read": "Read saved websites",
  "website:propose": "Prepare website changes for your review", "website:code": "Pick up website changes and report previews and deploys from a coding agent", "inquiries:read": "Customer inquiries",
  "quotes:approve": "Approve quote terms", "offline_access": "Renew this connection",
};
const statusLabels = { active: "Connected", expired: "Expired — connect again in your assistant", revoked: "Disconnected", authority_removed: "Business access ended" };
function date(value: string) { return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }); }

/** The workspace key remounts the panel so another business cannot inherit its records. */
export function AssistantConnections({ workspaceId, canManage = true }: { workspaceId: string; canManage?: boolean }) {
  return <AssistantConnectionsForWorkspace key={workspaceId} workspaceId={workspaceId} canManage={canManage} />;
}
function AssistantConnectionsForWorkspace({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const request = useWorkspaceRequest();
  const generation = useRef(0);
  const [connections, setConnections] = useState<z.infer<typeof connectionSchema>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(""); setConfirm(null);
    try {
      const response = await request(`/api/workspace/agent-connections?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const value = responseSchema.parse(await response.json());
      if (current === generation.current) setConnections(value.connections);
    } catch {
      if (current === generation.current) { setConnections([]); setError("Assistant access could not be loaded. Reload before changing a connection."); }
    } finally { if (current === generation.current) setLoading(false); }
  }, [workspaceId, request]);
  useEffect(() => { const guard = generation; if (canManage) void load(); return () => { guard.current++; }; }, [load, canManage]);
  async function disconnect(connection: z.infer<typeof connectionSchema>) {
    const current = generation.current;
    setPending(connection.id); setError(""); setNotice("");
    try {
      const response = await request(`/api/workspace/agent-connections/${connection.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok || (await response.json()).disconnected !== true) throw new Error("unconfirmed");
      if (current !== generation.current) return;
      setNotice(`${connection.clientName} disconnected. Its access and renewal tokens have been revoked.`);
      await load();
    } catch {
      if (current === generation.current) { setConnections([]); setError("Disconnect could not be confirmed. Reload to check current access before trying again."); }
    } finally { if (current <= generation.current) setPending(null); }
  }
  return <StSection id="assistant-connections-heading" title="Connected assistants">
    <p className="text-sm leading-relaxed text-gray-muted">Assistants use only the permissions you grant for this business. Website changes stay in Strelva for owner review.</p>
    {!canManage ? <StNotice>Only a business owner can manage assistant connections.</StNotice> : <>
      {notice && <p role="status" className="text-sm text-warm-black">{notice}</p>}
      {loading ? <div className="space-y-3"><p role="status" className="text-sm text-gray-muted">Loading assistant access…</p><StSkeleton /><StSkeleton width="70%" /></div> : error ? <div className="space-y-3"><StNotice tone="critical">{error}</StNotice><StPill variant="soft" onClick={() => void load()}>Reload connections</StPill></div> : !connections.length ? <StEmpty>No assistants are connected to this business. Add Strelva from Claude or Codex to get started.</StEmpty> : <div className="space-y-8">{connections.map(connection => <StSection key={connection.id} title={connection.clientName} meta={<StState kind={connection.status === "active" ? "live" : "draft"}>{statusLabels[connection.status]}</StState>}>
        <p className="break-all text-xs text-gray-muted">Client identity: <StMono>{connection.clientId}</StMono></p>
        <StRows label={`Permissions for ${connection.clientName}`}>{connection.scopes.map(scope => <StRow key={scope} title={permissionLabels[scope] || scope} />)}</StRows>
        <p className="text-xs text-gray-muted">Connected <StMono>{date(connection.createdAt)}</StMono> · Connection ends <StMono>{date(connection.expiresAt)}</StMono>{connection.lastUsedAt ? <> · Last renewed <StMono>{date(connection.lastUsedAt)}</StMono></> : null}</p>
        {connection.revokedAt === null && (confirm === connection.id ? <div className="space-y-3"><p className="text-sm text-warm-black">Disconnect {connection.clientName}? It will need your approval to connect again. Saved website proposals stay in Strelva.</p><div className="flex flex-wrap gap-3"><StPill disabled={pending !== null} busy={pending === connection.id} onClick={() => void disconnect(connection)}>Confirm disconnect</StPill><StPill variant="soft" disabled={pending !== null} onClick={() => setConfirm(null)}>Keep connected</StPill></div></div> : <div><StPill variant="soft" disabled={pending !== null} onClick={() => setConfirm(connection.id)}>Disconnect {connection.clientName}</StPill></div>)}
      </StSection>)}</div>}
    </>}
  </StSection>;
}
