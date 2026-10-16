"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { z } from "zod";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaSays, XaSheet, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { ASSISTANT_NEVER, assistantScope } from "@/experience/connections/assistant-scopes";
import styles from "@/experience/connections/xa-connections.module.css";
import { useWorkspaceRequest } from "./WorkspaceRequest";

const connectionSchema = z.object({
  id: z.uuid(), clientId: z.string(), clientName: z.string(), scopes: z.array(z.string()),
  createdAt: z.string(), expiresAt: z.string(), lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(), agencyId: z.uuid().nullable(),
  status: z.enum(["active", "expired", "revoked", "authority_removed"]),
});
type Connection = z.infer<typeof connectionSchema>;
const responseSchema = z.object({ connections: z.array(connectionSchema) });
/** Status shows exceptions only: a connected assistant shows its facts, not "Connected". */
const EXCEPTION: Record<Connection["status"], { kind: "waits" | "draft" | "down"; text: string } | null> = {
  active: null, expired: { kind: "waits", text: "Expired · connect again from the assistant" }, revoked: { kind: "draft", text: "Disconnected" }, authority_removed: { kind: "down", text: "Business access ended" },
};
function date(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function host(clientId: string) { try { return new URL(clientId).host; } catch { return null; } }

/** The workspace key remounts the panel so another business cannot inherit its records. */
export function AssistantConnections({ workspaceId, canManage = true, businessName }: { workspaceId: string; canManage?: boolean; businessName?: string }) {
  return <AssistantConnectionsForWorkspace key={workspaceId} workspaceId={workspaceId} canManage={canManage} businessName={businessName ?? "this business"} />;
}

/**
 * Connected assistants (XA · R4 group, R5 sheet). One white group, one row
 * per assistant; opening a row shows, indented under it, what it can do as
 * plain sentences and what it never does as lock lines. Disconnect is the R5
 * confirmation (what stops, what stays, who is recorded; a red pill and
 * "Keep it connected" as a text link), then the list re-reads from the
 * server so nothing is shown as gone before it is.
 */
function AssistantConnectionsForWorkspace({ workspaceId, canManage, businessName }: { workspaceId: string; canManage: boolean; businessName: string }) {
  const request = useWorkspaceRequest();
  const generation = useRef(0);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Connection | null>(null);
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
  async function disconnect(connection: Connection) {
    const current = generation.current;
    setPending(connection.id); setError(""); setNotice("");
    try {
      const response = await request(`/api/workspace/agent-connections/${connection.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok || (await response.json()).disconnected !== true) throw new Error("unconfirmed");
      if (current !== generation.current) return;
      setNotice(`You disconnected ${connection.clientName}. Its access and renewal ended at once.`);
      await load();
    } catch {
      if (current === generation.current) { setConfirm(null); setConnections([]); setError("Disconnect could not be confirmed. Reload to check current access before trying again."); }
    } finally { if (current <= generation.current) setPending(null); }
  }

  if (!canManage) return <section className={styles.section} aria-labelledby="assistant-connections-heading">
    <h2 id="assistant-connections-heading" className={styles.sectionTitle}>Connected assistants</h2>
    <XaSays>Only a business owner can see and manage assistant connections.</XaSays>
  </section>;

  return <section className={styles.section} aria-labelledby="assistant-connections-heading" aria-busy={loading || undefined}>
    <div className={styles.sectionHead}><h2 id="assistant-connections-heading" className={styles.sectionTitle}>Connected assistants</h2>{!loading && !error && connections.length ? <span className={styles.sectionMeta}><span className={styles.figure}>{connections.filter(item => item.status === "active").length}</span> connected</span> : null}</div>
    {notice ? <div role="status"><XaSays>{notice}</XaSays></div> : null}
    {loading ? <div className={styles.stack}><p role="status" className={styles.small}>Loading assistant access…</p><StSkeleton /><StSkeleton width="70%" /></div>
      : error ? <div role="alert" className={styles.section}><XaSays links={[<XaTextLink key="reload" onClick={() => void load()}>Reload connections</XaTextLink>]}>{error}</XaSays></div>
        : !connections.length ? <p className={styles.quiet}>No assistant is connected yet. Once you add Strelva in Claude, it shows here with what it can do for {businessName}.</p>
          : <ul className={styles.group} aria-label="Assistants connected to this business">{connections.map(connection => {
            const exception = EXCEPTION[connection.status];
            const expanded = open === connection.id;
            const panelId = `assistant-${connection.id}`;
            return <li key={connection.id} className={styles.groupRow} data-stack>
              <button type="button" className={styles.expand} aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : connection.id)}>
                <span className={styles.groupText}><span className={styles.groupTitle}>{connection.clientName}</span>
                  <span className={styles.groupDetail}>Connected {date(connection.createdAt)}{connection.lastUsedAt ? ` · last renewed ${date(connection.lastUsedAt)}` : ""}{connection.status === "active" ? ` · ends ${date(connection.expiresAt)}` : ""}</span></span>
                {exception ? <XaStatus kind={exception.kind} size="sm">{exception.text}</XaStatus> : null}
                <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
              </button>
              {expanded ? <div id={panelId} className={`${styles.detailPanel} ${styles.indent}`}>
                <p className={styles.groupLabel}>It can</p>
                <ul className={styles.sentences} aria-label={`What ${connection.clientName} can do`}>
                  {connection.scopes.filter(scope => scope !== "offline_access").map(scope => { const item = assistantScope(scope); return <li key={scope}>{item.title}. {item.detail.endsWith(".") ? item.detail : `${item.detail}.`}</li>; })}
                </ul>
                <p className={styles.groupLabel}>Never, without you</p>
                <ul className={styles.lines} aria-label={`What ${connection.clientName} never does without you`}>
                  {ASSISTANT_NEVER.map(item => <li key={item.title} className={styles.line}><Lock size={14} aria-hidden="true" /><span className={styles.lineText}>{item.title}</span><span className={styles.lineEnd}>{item.end}</span></li>)}
                </ul>
                {host(connection.clientId) ? <p className={styles.small}>Strelva checked this assistant’s identity at {host(connection.clientId)}. The name comes from that assistant.</p> : null}
                {connection.revokedAt === null ? <div><button type="button" className={styles.danger} disabled={pending !== null} onClick={() => setConfirm(connection)}>Disconnect {connection.clientName}</button></div> : null}
              </div> : null}
            </li>;
          })}</ul>}
    <XaSheet open={confirm !== null} onClose={() => { if (!pending) setConfirm(null); }} title={confirm ? `Disconnect ${confirm.clientName}?` : "Disconnect?"}
      actions={confirm ? <><button type="button" className={styles.destructive} disabled={pending !== null} aria-busy={pending === confirm.id || undefined} onClick={() => void disconnect(confirm)}>{pending === confirm.id ? "Disconnecting…" : `Disconnect ${confirm.clientName}`}</button>
        <XaTextLink onClick={() => { if (!pending) setConfirm(null); }}>Keep it connected</XaTextLink></> : null}>
      {confirm ? <>
        <p className={styles.sheetLede}>It loses access right away. Nothing you own changes.</p>
        <XaAnswers labelWidth={76} rows={[
          ["Stops", `Reading ${businessName}, right away. Its renewal ends too.`],
          ["Stays", "Website changes it prepared, waiting for your review."],
          ["Records", "That you disconnected it, and when."],
        ]} />
      </> : null}
    </XaSheet>
  </section>;
}
