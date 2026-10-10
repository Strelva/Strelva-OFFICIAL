"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StEntry, StHead, StRows, StRow, StMono, StState, StPill, StPillLink, StTextButton, StNotice, StSkeleton } from "@/components/ui/strelva/Kit";

type Preview = { workspaceId: string; workspaceName: string; recipientEmail: string; role: "owner" | "admin" | "member"; status: "pending" | "accepted" | "revoked" | "expired"; expiresAt: string };
type Accepted = { workspaceId: string; workspaceName: string; invitedRole: Preview["role"]; appliedRole: Preview["role"]; alreadyAccepted: boolean };

export function WorkspaceInvitationAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const target = `/workspace/invitations/accept/${token}`;

  useEffect(() => {
    let current = true;
    fetch(`/api/workspace-invitations/accept/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json().catch(() => ({})) as { invitation?: Preview; error?: string };
        if (!response.ok || !body.invitation) throw new Error(body.error || "This invitation is unavailable.");
        if (current) setPreview(body.invitation);
      })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : "This invitation is unavailable."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token]);

  async function accept() {
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/workspace-invitations/accept/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const body = await response.json().catch(() => ({})) as { accepted?: Accepted; error?: string };
      if (response.status === 401) {
        router.push(`/sign-in?next=${encodeURIComponent(target)}`);
        return;
      }
      if (!response.ok || !body.accepted) throw new Error(body.error || "The invitation could not be accepted.");
      setAccepted(body.accepted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be accepted.");
    } finally {
      setSubmitting(false);
    }
  }

  return <StEntry helpHref="/workspace?view=help">
    {loading ? <StSkeleton label="Checking invitation" />
      : accepted ? <><StHead title={`You joined ${accepted.workspaceName}`} /><StState kind="live">Access confirmed</StState><p className="text-sm text-gray-muted">Your role is {accepted.appliedRole}. {accepted.appliedRole !== accepted.invitedRole ? "Your existing higher role was kept." : accepted.alreadyAccepted ? "This invitation was already accepted; no duplicate membership was created." : "The workspace is now available to your account."}</p><StPillLink href={`/workspace?workspaceId=${encodeURIComponent(accepted.workspaceId)}`}>Open workspace</StPillLink></>
        : preview ? <><StHead title={`${preview.workspaceName} invited you`} meta="The business controls who can open its workspace." /><StRows><StRow kind="Invited account" title={<StMono tone="text">{preview.recipientEmail}</StMono>} detail={`${preview.role} access · expires ${new Date(preview.expiresAt).toLocaleString()}`} end={<StState kind={preview.status === "pending" ? "need" : "draft"}>{preview.status}</StState>} /></StRows>
          {preview.status === "pending" ? <><p className="text-sm text-gray-muted">Accepting grants this verified account access to the workspace. The link does not grant access by itself.</p><StPill busy={submitting} block onClick={() => void accept()}>Continue as {preview.recipientEmail}</StPill><StTextButton href={`/sign-in?next=${encodeURIComponent(target)}`} tone="accent">Sign in with invited account</StTextButton><StTextButton href={`/sign-up?next=${encodeURIComponent(target)}`}>Create invited account</StTextButton><StTextButton href="/account">Not now</StTextButton></>
            : <StNotice>{preview.status === "revoked" ? "The workspace owner revoked this invitation." : preview.status === "expired" ? "This invitation expired. Ask the workspace owner for a new link." : "This invitation has already been accepted."}</StNotice>}
        </> : <StHead title="Invitation unavailable" />}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </StEntry>;
}
