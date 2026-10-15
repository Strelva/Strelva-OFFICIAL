"use client";

import { useState } from "react";
import { StEmpty, StInput, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { OwnerInvitationsLoad } from "@/platform/owner-entry/operator-invitations";
import type { OwnerInvitationResult } from "@/platform/workspaces/business-ownership";

/** What the operator is told once an invitation exists: emailed, or plainly not, with the link to copy. */
export function ownerInvitationNotice(deliveryStatus: string, recipientEmail: string): string {
  return deliveryStatus === "sent" || deliveryStatus === "accepted"
    ? `Invitation emailed to ${recipientEmail}.`
    : "Client email is off, so nothing was emailed. Copy this link and send it yourself.";
}

export function OwnerInvitationsPanel({ tenantId, load, request = fetch }: { tenantId: string; load: OwnerInvitationsLoad; request?: typeof fetch }) {
  const [state, setState] = useState(load.kind === "ready" ? load.state : null);
  const [recipient, setRecipient] = useState(state?.recipient?.email ?? "");
  const [approvalId, setApprovalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const recipientRecord = state?.recipient as (NonNullable<typeof state>["recipient"] & { trusted?: boolean; source?: string; verified?: boolean }) | null | undefined;
  const recipientIsTrusted = Boolean(recipientRecord && (
    recipientRecord.trusted === true || (recipientRecord.from === "record" && (
      recipientRecord.source === "tenant_import" || (recipientRecord.source === "owner" && recipientRecord.verified === true)
    ))
  ) && recipientRecord?.email.trim().toLowerCase() === recipient.trim().toLowerCase());

  async function submit(command: { action: "invite" } | { action: "revoke"; invitationId: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/owner-invitations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command.action === "invite"
          ? { ...command, recipientEmail: recipient.trim(), ...(!recipientIsTrusted && approvalId.trim() ? { approvalId: approvalId.trim() } : {}) }
          : command),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The invitation could not be changed. Refresh its state before trying again.");
      if (command.action === "revoke") {
        setAcceptUrl(null);
        setMessage(data.status === "accepted" ? "This invitation was already accepted. The business has an owner." : `Invitation ${data.status}.`);
        setState((current) => current && ({ ...current, hasOwner: data.status === "accepted" || current.hasOwner,
          pending: current.pending.filter((invitation) => invitation.invitationId !== command.invitationId) }));
      } else {
        const result: Omit<OwnerInvitationResult, "acceptUrl" | "delivery"> & { acceptUrl?: string; delivery: { status: string } } = data;
        setAcceptUrl(result.acceptUrl ?? null);
        setApprovalId("");
        setMessage(ownerInvitationNotice(result.delivery.status, result.invitation.recipientEmail));
        setState((current) => current && ({ ...current, pending: [...current.pending, {
          invitationId: result.invitation.invitationId, recipientEmail: result.invitation.recipientEmail,
          expiresAt: result.invitation.expiresAt, createdAt: result.invitation.createdAt,
        }] }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The invitation could not be changed."); }
    finally { setBusy(false); }
  }

  async function recordApproval() {
    if (busy || !state || !recipient.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await request(`/api/admin/workspaces/${encodeURIComponent(state.workspaceId)}/action-approvals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "owner_invitation.issue", recipientEmail: recipient.trim().toLowerCase(), sendEmail: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The approval could not be recorded.");
      setApprovalId(data.approval.approvalId as string);
      setMessage(`Approval recorded by this signed-in operator until ${new Date(data.approval.expiresAt).toLocaleTimeString()}. For this address, a different operator must issue the invitation.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The approval could not be recorded."); }
    finally { setBusy(false); }
  }

  return <StSection title="Owner access">
    {load.kind === "unconverted" ? <StEmpty>Convert this site to a business before inviting its owner.</StEmpty>
      : load.kind === "denied" ? <StEmpty>An active Strelva operator with business admin membership is required.</StEmpty>
      : load.kind === "unavailable" ? <StNotice tone="critical">Owner invitation state could not be read. Refresh to try again.</StNotice>
      : state?.hasOwner ? <StEmpty>This business already has an owner.</StEmpty>
      : state?.exited ? <StEmpty>This business has left Strelva. New invitations are closed.</StEmpty>
      : state && <>
        {state.pending.length > 0 ? <StRows label="Pending owner invitations">{state.pending.map(invitation => <StRow key={invitation.invitationId} title={invitation.recipientEmail} detail={<>Waiting for the owner. Expires {new Date(invitation.expiresAt).toLocaleDateString()}.</>} end={<StTextButton tone="danger" disabled={busy} onClick={() => void submit({ action: "revoke", invitationId: invitation.invitationId })}>Revoke invitation</StTextButton>} />)}</StRows>
          : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit({ action: "invite" }); }}>
            <StInput type="email" label="Owner email" value={recipient} onChange={event => { setRecipient(event.target.value); setApprovalId(""); setMessage(null); }} required disabled={busy} />
            {recipientIsTrusted ? <StNotice>This matches the business&apos;s trusted owner address. Preparing the link records your approval after a sign-in from the last 10 minutes.</StNotice> : <>
              <StInput label="Approval ID from a different operator" value={approvalId} onChange={event => setApprovalId(event.target.value)} disabled={busy} autoComplete="off" hint="A second active operator can record approval for this exact address below. Use that ID while signed in as the issuing operator." />
              <StTextButton disabled={busy || !recipient.trim()} onClick={() => void recordApproval()}>Record approval as this operator</StTextButton>
            </>}
            <StPill type="submit" disabled={busy || !recipient.trim() || (!recipientIsTrusted && !approvalId.trim())} busy={busy}>Prepare invitation link</StPill>
          </form>}
      </>}
    <StState kind="draft">Owner emails off globally during rollout</StState>
    <StNotice>Email delivery remains disabled. The link appears only in this authenticated response.</StNotice>
    {message && <div role="status"><StNotice>{message}</StNotice></div>}
    {acceptUrl && <StInput label="Invitation link — keep private" value={acceptUrl} readOnly hint="Available only now. Revoke and prepare a new invitation if the link is lost." onFocus={event => event.target.select()} />}
    {error && <StNotice tone="critical">{error}</StNotice>}
  </StSection>;
}
