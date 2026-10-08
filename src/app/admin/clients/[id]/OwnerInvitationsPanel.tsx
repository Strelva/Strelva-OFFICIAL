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
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  async function submit(command: { action: "invite"; sendEmail: boolean } | { action: "revoke"; invitationId: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request(`/api/admin/tenants/${encodeURIComponent(tenantId)}/owner-invitations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command.action === "invite"
          ? { ...command, recipientEmail: recipient.trim(), jacobApproved: approved }
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
        setApproved(false);
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
          </ul> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit({ action: "invite", sendEmail: false }); }}>
            <TextInput type="email" label="Owner email" value={recipient} onChange={(event) => { setRecipient(event.target.value); setApproved(false); }} required disabled={busy} />
            <label className="flex min-h-12 items-center gap-3 text-sm text-gray-muted">
              <input type="checkbox" checked={approved} disabled={busy} onChange={(event) => setApproved(event.target.checked)} className="size-5 accent-accent" />
              Jacob approved an owner invitation for this business and this address.
            </label>
            <div className="flex flex-wrap gap-4">
              <Button type="submit" disabled={!approved || busy || !recipient.trim()} loading={busy}>Prepare invitation link</Button>
              <Button type="button" variant="secondary" disabled={!approved || busy || !recipient.trim()} onClick={() => void submit({ action: "invite", sendEmail: true })}>Email invitation</Button>
            </div>
            <p className="text-sm text-gray-muted">Preparing a link sends no email. Email delivery follows this business&apos;s existing email controls.</p>
          </form>}
        </>}
      {message && <p role="status" className="text-sm text-gray-muted">{message}</p>}
      {acceptUrl && <TextInput label="Invitation link — keep private" value={acceptUrl} readOnly helperText="Available only now. Revoke and prepare a new invitation if the link is lost." onFocus={(event) => event.target.select()} />}
      {error && <p role="alert" className="text-sm text-critical">{error}</p>}
    </Panel>
  );
}
