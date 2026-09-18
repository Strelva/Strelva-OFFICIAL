"use client";

import { Copy, Link2, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/TextInput";

type Role = "owner" | "admin" | "member";
type Invitation = { id: string; recipientEmail: string; role: Role; status: "pending" | "accepted" | "revoked" | "expired"; expiresAt: string; createdAt: string };

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : fallback);
  return body as T;
}

export function WorkspaceInvitationManager({ workspaceId }: { workspaceId: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [createdLink, setCreatedLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await responseJson<{ invitations: Invitation[] }>(
        await fetch(`/api/workspace-invitations?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
        "Invitations could not be loaded.",
      );
      setInvitations(Array.isArray(body.invitations) ? body.invitations : []);
    } catch (error) {
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

  return (
    <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black md:px-8 lg:px-12">
      <div className="mx-auto max-w-[960px]">
        <a href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`} className="text-sm text-gray-muted underline-offset-4 hover:underline">Back to People &amp; access</a>
        <div className="mt-10 flex items-start gap-4">
          <div className="rounded-xl bg-accent/15 p-3 text-accent-text"><UserPlus className="size-5" aria-hidden="true" /></div>
          <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Workspace access</p><h1 className="mt-2 font-display text-[40px] font-medium leading-tight">Invite a person</h1><p className="mt-3 max-w-2xl text-base leading-6 text-gray-muted">Prepare a private seven-day link. The recipient sees the workspace and intended role, then explicitly accepts with the exact verified email address you entered.</p></div>
        </div>

        <Card padding="lg" className="mt-10">
          <form onSubmit={create} className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <TextInput label="Recipient email" type="email" autoComplete="email" required value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} placeholder="person@business.com" />
            <SelectInput label="Workspace role" value={role} onChange={event => setRole(event.target.value as Role)} options={[{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }, { value: "owner", label: "Owner" }]} />
            <Button type="submit" size="lg" loading={submitting} icon={<Link2 className="size-4" />}>Create link</Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-gray-muted"><ShieldCheck className="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />The link alone grants no access. Acceptance rechecks the recipient’s confirmed Supabase identity.</p>
          {createdLink ? <div className="mt-6 rounded-xl bg-surface-inset p-4"><label htmlFor="workspace-invitation-link" className="text-xs text-gray-muted">Private invitation link</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="workspace-invitation-link" readOnly value={createdLink} className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-border bg-surface px-4 text-sm text-warm-black" onFocus={event => event.currentTarget.select()} /><Button type="button" variant="secondary" onClick={() => void copyLink()} icon={<Copy className="size-4" />}>{copied ? "Copied" : "Copy link"}</Button></div></div> : null}
        </Card>

        {notice ? <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-5 rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-critical/30 text-critical" : "border-positive/30 text-positive"}`}>{notice.message}</p> : null}

        <section className="mt-12" aria-labelledby="invitation-history-title">
          <h2 id="invitation-history-title" className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Invitation history</h2>
          {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-gray-muted"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Loading invitations</p>
            : invitations.length === 0 ? <p className="mt-4 border-y border-gray-border py-6 text-sm text-gray-muted">No workspace invitations yet.</p>
              : <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{invitations.map(invitation => <li key={invitation.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{invitation.recipientEmail}</p><p className="mt-1 text-xs capitalize text-gray-muted">{invitation.role} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div>{invitation.status === "pending" ? <Button type="button" size="sm" variant="danger" disabled={submitting} onClick={() => void revoke(invitation.id)}>Revoke</Button> : null}</li>)}</ul>}
        </section>
      </div>
    </main>
  );
}
