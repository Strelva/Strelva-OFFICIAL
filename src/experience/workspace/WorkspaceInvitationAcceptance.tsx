"use client";

import { Check, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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

  return (
    <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-[720px] items-center">
        <Card padding="lg" className="w-full">
          {loading ? <p className="flex items-center gap-3 text-sm text-gray-muted"><Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" />Checking invitation</p>
            : accepted ? <div><div className="flex size-12 items-center justify-center rounded-full bg-positive/15 text-positive"><Check className="size-6" aria-hidden="true" /></div><p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-positive">Access confirmed</p><h1 className="mt-3 font-display text-[40px] font-medium leading-tight">You joined {accepted.workspaceName}.</h1><p className="mt-4 text-base leading-6 text-gray-muted">Your role is {accepted.appliedRole}. {accepted.appliedRole !== accepted.invitedRole ? "Your existing higher role was kept." : accepted.alreadyAccepted ? "This invitation was already accepted; no duplicate membership was created." : "The workspace is now available to your account."}</p><a href={`/workspace?workspaceId=${encodeURIComponent(accepted.workspaceId)}`} className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent/85">Open workspace</a></div>
              : preview ? <div><LockKeyhole className="size-7 text-accent-text" aria-hidden="true" /><p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Workspace invitation</p><h1 className="mt-3 font-display text-[40px] font-medium leading-tight">Join {preview.workspaceName}</h1><dl className="mt-8 grid gap-4 border-y border-gray-border py-6 sm:grid-cols-2"><div><dt className="text-xs text-gray-muted">Invited account</dt><dd className="mt-1 text-sm font-medium">{preview.recipientEmail}</dd></div><div><dt className="text-xs text-gray-muted">Role</dt><dd className="mt-1 text-sm font-medium capitalize">{preview.role}</dd></div><div><dt className="text-xs text-gray-muted">Status</dt><dd className="mt-1 text-sm font-medium capitalize">{preview.status}</dd></div><div><dt className="text-xs text-gray-muted">Expires</dt><dd className="mt-1 text-sm font-medium">{new Date(preview.expiresAt).toLocaleString()}</dd></div></dl>{preview.status === "pending" ? <><p className="mt-6 text-sm leading-6 text-gray-muted">Accepting grants this verified account access to the workspace. The link does not grant access by itself.</p><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Button size="lg" loading={submitting} onClick={() => void accept()}>Accept invitation</Button><a href={`/sign-in?next=${encodeURIComponent(target)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-border px-4 text-sm font-medium hover:bg-gray-bg">Sign in with invited account</a><a href={`/sign-up?next=${encodeURIComponent(target)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-medium text-gray-muted underline-offset-4 hover:underline">Create invited account</a></div></> : <p className="mt-6 text-sm text-gray-muted">{preview.status === "revoked" ? "The workspace owner revoked this invitation." : preview.status === "expired" ? "This invitation expired. Ask the workspace owner for a new link." : "This invitation has already been accepted."}</p>}</div>
                : <div><LockKeyhole className="size-7 text-critical" aria-hidden="true" /><h1 className="mt-6 font-display text-[36px] font-medium">Invitation unavailable</h1></div>}
          {error ? <p role="alert" className="mt-6 rounded-xl border border-critical/30 px-4 py-3 text-sm text-critical">{error}</p> : null}
        </Card>
      </div>
    </main>
  );
}
