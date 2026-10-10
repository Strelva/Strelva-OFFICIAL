"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
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
  "website:propose": "Prepare website changes for your review", "inquiries:read": "Customer inquiries",
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
  return <section aria-labelledby="assistant-connections-heading" className="space-y-4">
    <h2 id="assistant-connections-heading" className="text-base font-medium text-warm-black">Connected assistants</h2>
    <p className="text-sm leading-relaxed text-gray-muted">Assistants use only the permissions you grant for this business. Website changes stay in Strelva for owner review.</p>
    {!canManage ? <p className="text-sm text-gray-muted">Only a business owner can manage assistant connections.</p> : <>
      {notice && <p role="status" className="text-sm text-warm-black">{notice}</p>}
      {loading ? <p role="status" className="text-sm text-gray-muted">Loading assistant access…</p> : error ? <div className="space-y-3"><p role="alert" className="text-sm text-critical">{error}</p><Button variant="secondary" onClick={() => void load()}>Reload connections</Button></div> : !connections.length ? <p className="text-sm text-gray-muted">No assistants are connected to this business. Add Strelva from Claude or Codex to get started.</p> : <ul className="divide-y divide-gray-border border-y border-gray-border">{connections.map(connection => <li key={connection.id} className="space-y-3 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-medium text-warm-black break-words">{connection.clientName}</h3><span className="text-xs text-gray-muted">{statusLabels[connection.status]}</span></div>
        <p className="break-all text-xs text-gray-muted">Client identity: {connection.clientId}</p>
        <ul className="space-y-1 text-sm text-warm-black">{connection.scopes.map(scope => <li key={scope}>{permissionLabels[scope] || scope}</li>)}</ul>
        <p className="text-xs text-gray-muted">Connected {date(connection.createdAt)} · Connection ends {date(connection.expiresAt)}{connection.lastUsedAt ? ` · Last renewed ${date(connection.lastUsedAt)}` : ""}</p>
        {connection.revokedAt === null && (confirm === connection.id ? <div className="space-y-3"><p className="text-sm text-warm-black">Disconnect {connection.clientName}? It will need your approval to connect again. Saved website proposals stay in Strelva.</p><div className="flex flex-wrap gap-3"><Button variant="danger" disabled={pending !== null} loading={pending === connection.id} onClick={() => void disconnect(connection)}>Confirm disconnect</Button><Button variant="secondary" disabled={pending !== null} onClick={() => setConfirm(null)}>Keep connected</Button></div></div> : <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirm(connection.id)}>Disconnect {connection.clientName}</Button>)}
      </li>)}</ul>}
    </>}
  </section>;
}
