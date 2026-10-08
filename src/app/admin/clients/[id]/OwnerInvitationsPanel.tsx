"use client";

import { useState } from "react";
import { Panel } from "@/app/admin/console";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { OwnerInvitationsLoad } from "@/platform/owner-entry/operator-invitations";
import type { OwnerInvitationResult } from "@/platform/workspaces/business-ownership";

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
        const result: Omit<OwnerInvitationResult, "acceptUrl"> & { acceptUrl?: string } = data;
        setAcceptUrl(result.acceptUrl ?? null);
        setApprovalId("");
        setMessage(result.delivery.status === "sent"
          ? `Invitation emailed to ${result.invitation.recipientEmail}.`
          : result.delivery.reason === "email_not_requested"
          ? "Invitation link prepared. No email was sent."
          : `Invitation created. Email was not sent: ${result.delivery.reason}.`);
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

  return (
    <Panel title="Business owner" bodyClassName="p-6 space-y-4">
      {load.kind === "unconverted" ? <p className="text-sm text-gray-muted">Convert this site to a business before inviting its owner.</p>
        : load.kind === "denied" ? <p className="text-sm text-gray-muted">An active Strelva operator with business admin membership is required.</p>
        : load.kind === "unavailable" ? <p role="alert" className="text-sm text-critical">Owner invitation state could not be read. Refresh to try again.</p>
        : state?.hasOwner ? <p className="text-sm text-gray-muted">This business already has an owner.</p>
        : state?.exited ? <p className="text-sm text-gray-muted">This business has left Strelva. New invitations are closed.</p>
        : state && <>
          {state.pending.length > 0 ? <ul className="space-y-4">
            {state.pending.map((invitation) => <li key={invitation.invitationId} className="flex flex-wrap items-center justify-between gap-4">
              <p className="min-w-0 break-words text-sm text-gray-muted">
                Waiting for {invitation.recipientEmail}. Expires {new Date(invitation.expiresAt).toLocaleDateString()}.
              </p>
              <Button type="button" variant="danger" disabled={busy} onClick={() => void submit({ action: "revoke", invitationId: invitation.invitationId })}>Revoke invitation</Button>
            </li>)}
          </ul> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit({ action: "invite" }); }}>
            <TextInput type="email" label="Owner email" value={recipient} onChange={(event) => { setRecipient(event.target.value); setApprovalId(""); setMessage(null); }} required disabled={busy} />
            {recipientIsTrusted ? <p className="text-sm text-gray-muted">This matches the business&apos;s trusted owner address. Preparing the link records your approval after a sign-in from the last 10 minutes.</p> : <>
              <TextInput label="Approval ID from a different operator" value={approvalId} onChange={(event) => setApprovalId(event.target.value)} disabled={busy} autoComplete="off" helperText="A second active operator can record approval for this exact address below. Use that ID while signed in as the issuing operator." />
              <Button type="button" variant="secondary" disabled={busy || !recipient.trim()} onClick={() => void recordApproval()}>Record approval as this operator</Button>
            </>}
            <div className="flex flex-wrap gap-4">
              <Button type="submit" disabled={busy || !recipient.trim() || (!recipientIsTrusted && !approvalId.trim())} loading={busy}>Prepare invitation link</Button>
            </div>
            <p className="text-sm text-gray-muted">Email delivery remains disabled. The link appears only in this authenticated response.</p>
          </form>}
        </>}
      {message && <p role="status" className="text-sm text-gray-muted">{message}</p>}
      {acceptUrl && <TextInput label="Invitation link — keep private" value={acceptUrl} readOnly helperText="Available only now. Revoke and prepare a new invitation if the link is lost." onFocus={(event) => event.target.select()} />}
      {error && <p role="alert" className="text-sm text-critical">{error}</p>}
    </Panel>
  );
}
