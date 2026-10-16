"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { WorkspaceSurfaceShell } from "./WorkspaceSurfaceShell";
import { StPage, StField, StHead, StSection, StSurface, StRows, StRow, StState, StPill, StTextButton, StNotice, StSkeleton, StEmpty } from "@/components/ui/strelva/Kit";

type Role = "owner" | "admin" | "member";
type Invitation = { id: string; recipientEmail: string; role: Role; status: "pending" | "accepted" | "revoked" | "expired"; expiresAt: string; createdAt: string };

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : fallback);
  return body as T;
}

export function WorkspaceInvitationManager({ workspaceId, businessName, systemsReleased = false }: { workspaceId: string; businessName?: string; systemsReleased?: boolean }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [createdLink, setCreatedLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setHistoryError(false);
    setNotice(null);
    try {
      const body = await responseJson<{ invitations: Invitation[] }>(
        await fetch(`/api/workspace-invitations?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
        "Invitations could not be loaded.",
      );
      setInvitations(Array.isArray(body.invitations) ? body.invitations : []);
    } catch (error) {
      setHistoryError(true);
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Invitations could not be loaded." });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setNotice(null); setCreatedLink(""); setCopied(false);
    try {
      const body = await responseJson<{ invitation: Invitation; token: string }>(await fetch("/api/workspace-invitations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, recipientEmail, role }),
      }), "The invitation could not be created.");
      setCreatedLink(`${window.location.origin}/workspace/invitations/accept/${body.token}`);
      setInvitations(current => [body.invitation, ...current]);
      setRecipientEmail("");
      setNotice({ kind: "success", message: `Invitation prepared for ${body.invitation.recipientEmail}. Share the private link with that person.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "The invitation could not be created." });
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(invitationId: string) {
    setSubmitting(true); setNotice(null);
    try {
      const body = await responseJson<{ status: Invitation["status"] }>(await fetch("/api/workspace-invitations/revoke", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invitationId }),
      }), "The invitation could not be revoked.");
      setInvitations(current => current.map(invitation => invitation.id === invitationId ? { ...invitation, status: body.status } : invitation));
      setNotice({ kind: "success", message: body.status === "revoked" ? "Invitation revoked. Its link can no longer grant access." : `Invitation is already ${body.status}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "The invitation could not be revoked." });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(createdLink); setCopied(true); }
    catch { setNotice({ kind: "error", message: "Copy is unavailable. Select the link and copy it manually." }); }
  }

  return <WorkspaceSurfaceShell workspaceId={workspaceId} businessName={businessName} systemsReleased={systemsReleased}><StPage>
    <StHead title="Invite someone" crumb={{label: "People & access", href: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}} meta="Prepare a private seven-day link. The recipient accepts with the exact verified email you enter." />
    <StSurface label="Invitation form">
      <form onSubmit={create} className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
        <StField label="Recipient email"><input type="email" autoComplete="email" required value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} placeholder="person@business.com" /></StField>
        <StField label="Role"><select value={role} onChange={event => setRole(event.target.value as Role)}><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select></StField>
        <StPill type="submit" busy={submitting}>Create link</StPill>
      </form>
      <p className="mt-4 text-sm text-gray-muted">The link alone grants no access. Strelva checks the recipient’s confirmed identity when they accept.</p>
      {createdLink ? <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"><StField label="Private invitation link"><input id="workspace-invitation-link" readOnly value={createdLink} onFocus={event => event.currentTarget.select()} /></StField><StPill variant="soft" onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</StPill></div> : null}
    </StSurface>
    {notice ? <StNotice tone={notice.kind === "error" ? "critical" : undefined}><span role={notice.kind === "success" ? "status" : undefined}>{notice.message}</span></StNotice> : null}
    <StSection title="Invitation history">
      {loading ? <StSkeleton label="Loading invitations" /> : historyError ? <StNotice tone="critical" action={<StTextButton onClick={() => void load()}>Reload invitations</StTextButton>}>Invitation history could not be read.{invitations.length ? " The last read is kept until you reload." : ""}</StNotice> : !invitations.length ? <StEmpty>No invitations yet.</StEmpty> : <StRows>{invitations.map(invitation => <StRow key={invitation.id} title={invitation.recipientEmail} detail={`${invitation.role} · expires ${new Date(invitation.expiresAt).toLocaleDateString()}`} end={<><StState kind={invitation.status === "pending" ? "need" : invitation.status === "accepted" ? "live" : "draft"}>{invitation.status}</StState>{invitation.status === "pending" ? <StTextButton tone="danger" disabled={submitting} onClick={() => void revoke(invitation.id)}>Revoke</StTextButton> : null}</>} />)}</StRows>}
    </StSection>
  </StPage></WorkspaceSurfaceShell>;
}
