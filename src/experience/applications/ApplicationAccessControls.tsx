"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { ApplicationRecordEditScope, ApplicationRecordReadScope, ApplicationViewKind } from "@/products/applications/client";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

type ApplicationStatus = "draft" | "installed" | "retired";

type IssuedGrant = {
  id: string;
  recipientEmail: string;
  views: ApplicationViewKind[];
  recordRead: ApplicationRecordReadScope;
  recordEdit: ApplicationRecordEditScope;
  recordSubmit: boolean;
  expiresAt: string;
  status: "active" | "revoked";
};

type Props = {
  workId: string;
  status: ApplicationStatus;
  hasRelease: boolean;
  canManage: boolean;
  disabled: boolean;
};

const viewOptions: Array<{ kind: ApplicationViewKind; label: string }> = [
  { kind: "form", label: "Enter a record" },
  { kind: "list", label: "Browse records" },
  { kind: "detail", label: "Inspect a record" },
  { kind: "document", label: "Read a record as a document" },
];

function defaultExpiry(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function expiryIso(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error("Choose an expiry date and time.");
  return date.toISOString();
}

function responseError(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : fallback;
}

function grantFromResponse(body: unknown): { grant: IssuedGrant; href: string } {
  if (!body || typeof body !== "object") throw new Error("The access link could not be confirmed.");
  const value = body as { grant?: unknown; href?: unknown };
  if (!value.grant || typeof value.grant !== "object" || typeof value.href !== "string") {
    throw new Error("The access link could not be confirmed.");
  }
  const grant = value.grant as Partial<IssuedGrant>;
  if (typeof grant.id !== "string" || typeof grant.recipientEmail !== "string" || !Array.isArray(grant.views) || typeof grant.expiresAt !== "string") {
    throw new Error("The access link could not be confirmed.");
  }
  return {
    href: value.href,
    grant: {
      id: grant.id,
      recipientEmail: grant.recipientEmail,
      views: grant.views as ApplicationViewKind[],
      recordRead: grant.recordRead === "all" || grant.recordRead === "own" ? grant.recordRead : "none",
      recordEdit: grant.recordEdit === "all" || grant.recordEdit === "own" ? grant.recordEdit : "none",
      recordSubmit: grant.recordSubmit === true,
      expiresAt: grant.expiresAt,
      status: grant.status === "revoked" ? "revoked" : "active",
    },
  };
}

function grantsFromResponse(body: unknown): IssuedGrant[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { grants?: unknown }).grants)) return [];
  return (body as { grants: unknown[] }).grants.flatMap(value => {
    try {
      return [grantFromResponse({ grant: value, href: `/apps` }).grant];
    } catch {
      return [];
    }
  });
}

export function ApplicationAccessControls({ workId, status, hasRelease, canManage, disabled }: Props) {
  const request = useWorkspaceRequest();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [views, setViews] = useState<ApplicationViewKind[]>(["form", "list"]);
  const [recordRead, setRecordRead] = useState<ApplicationRecordReadScope>("own");
  const [recordEdit, setRecordEdit] = useState<ApplicationRecordEditScope>("none");
  const [recordSubmit, setRecordSubmit] = useState(true);
  const [purpose, setPurpose] = useState("Submit records");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [grants, setGrants] = useState<IssuedGrant[]>([]);
  const [managerAllowed, setManagerAllowed] = useState(false);
  const [managerDenied, setManagerDenied] = useState(false);
  const [managerError, setManagerError] = useState("");
  const [managerReload, setManagerReload] = useState(0);
  const localMutations = useRef(new Map<string, IssuedGrant>());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    setManagerAllowed(false);
    setManagerDenied(false);
    setManagerError("");
    void request(`/api/apps/${encodeURIComponent(workId)}/access`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async response => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 403) {
            if (active) setManagerDenied(true);
            return;
          }
          throw new Error(responseError(body, "Existing access links could not be loaded."));
        }
        if (active) {
          const loaded = grantsFromResponse(body);
          setGrants(current => {
            const merged = loaded.map(grant => localMutations.current.get(grant.id) ?? grant);
            const loadedIds = new Set(merged.map(grant => grant.id));
            return [...merged, ...current.filter(grant => !loadedIds.has(grant.id) && localMutations.current.has(grant.id))];
          });
          setManagerAllowed(true);
        }
      })
      .catch(cause => {
        if (active && canManage) setManagerError(cause instanceof Error ? cause.message : "Existing access links could not be loaded.");
      });
    return () => { active = false; };
  }, [canManage, managerReload, request, workId]);

  if (!canManage || managerDenied) return null;
  if (!managerAllowed) {
    if (!managerError) return null;
    return (
      <section aria-labelledby="application-access-heading" className="space-y-3 border-t border-gray-border pt-6">
        <h2 id="application-access-heading" className="font-display text-xl">Give someone a link</h2>
        <p role="alert" className="rounded-lg border border-terra/30 bg-terra/5 px-3 py-2 text-sm text-terra">{managerError}</p>
        <Button type="button" variant="secondary" onClick={() => setManagerReload(value => value + 1)}>Try again</Button>
      </section>
    );
  }

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setCopied(false);
    setError("");
    setNotice("");
    try {
      const response = await request(`/api/apps/${encodeURIComponent(workId)}/access`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail,
          views,
          recordRead,
          recordEdit,
          recordSubmit,
          purpose,
          expiresAt: expiryIso(expiresAt),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body, "The access link could not be issued."));
      const result = grantFromResponse(body);
      localMutations.current.set(result.grant.id, result.grant);
      setGrants(current => [result.grant, ...current.filter(grant => grant.id !== result.grant.id)]);
      setNotice("Access link ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The access link could not be issued.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setCopied(false);
    setError("");
    try {
      await navigator.clipboard.writeText(new URL(`/apps/${workId}`, window.location.origin).toString());
      setCopied(true);
      setNotice("Link copied.");
    } catch {
      setError("Copy failed. Open the link and copy it from the address bar.");
    }
  }

  async function revoke(grant: IssuedGrant) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request(`/api/apps/${encodeURIComponent(workId)}/access?grantId=${encodeURIComponent(grant.id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body, "The access link could not be revoked."));
      const revoked = { ...grant, status: "revoked" as const };
      localMutations.current.set(grant.id, revoked);
      setGrants(current => current.map(item => item.id === grant.id ? revoked : item));
      setNotice("Access revoked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The access link could not be revoked.");
    } finally {
      setBusy(false);
    }
  }

  function toggleView(kind: ApplicationViewKind, checked: boolean) {
    setViews(current => checked ? [...new Set([...current, kind])] : current.filter(value => value !== kind));
    if (kind === "form" && !checked) setRecordSubmit(false);
  }

  return (
    <section aria-labelledby="application-access-heading" className="space-y-5 border-t border-gray-border pt-6">
      <div className="space-y-2">
        <h2 id="application-access-heading" className="font-display text-xl">Give someone a link</h2>
        <p className="text-sm leading-6 text-gray-fg">Choose what this person can open and change. The link stays the same when you publish another version.</p>
      </div>
      {!hasRelease || status === "retired" ? (
        <p role="status" className="rounded-lg border border-dashed border-gray-border bg-surface-inset px-4 py-3 text-sm text-gray-muted">Make a version available before giving someone a link.</p>
      ) : (
        <form className="space-y-5" onSubmit={event => void issue(event)}>
          <TextInput label="Recipient email" type="email" value={recipientEmail} maxLength={254} required disabled={disabled || busy} onChange={event => setRecipientEmail(event.target.value)} />
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">What they can open</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {viewOptions.map(option => (
                <label key={option.kind} className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" checked={views.includes(option.kind)} disabled={disabled || busy} onChange={event => toggleView(option.kind, event.target.checked)} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Records they can see<select className="mt-1 block min-h-11 w-full rounded-xl border border-gray-border bg-surface px-3 py-2 text-sm" value={recordRead} disabled={disabled || busy} onChange={event => setRecordRead(event.target.value as ApplicationRecordReadScope)}><option value="none">No records</option><option value="own">Only records they submit</option><option value="all">All records</option></select></label>
            <label className="text-sm">Records they can edit<select className="mt-1 block min-h-11 w-full rounded-xl border border-gray-border bg-surface px-3 py-2 text-sm" value={recordEdit} disabled={disabled || busy} onChange={event => { const next = event.target.value as ApplicationRecordEditScope; setRecordEdit(next); if (next !== "none" && recordRead === "none") setRecordRead(next); }}><option value="none">No editing</option><option value="own">Their submitted records</option><option value="all">All visible records</option></select></label>
            <TextInput label="Link expires" type="datetime-local" value={expiresAt} min={new Date().toISOString().slice(0, 16)} required disabled={disabled || busy} onChange={event => setExpiresAt(event.target.value)} />
          </div>
          <TextInput label="Why they need it" value={purpose} maxLength={500} required disabled={disabled || busy} onChange={event => setPurpose(event.target.value)} />
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={recordSubmit} disabled={disabled || busy || !views.includes("form")} onChange={event => setRecordSubmit(event.target.checked)} />Let them submit records</label>
          {error ? <p role="alert" className="rounded-lg border border-terra/30 bg-terra/5 px-3 py-2 text-sm text-terra">{error}</p> : null}
          {notice ? <p role="status" className="rounded-lg border border-sage/30 bg-sage/5 px-3 py-2 text-sm text-sage-dark">{notice}</p> : null}
          <Button type="submit" loading={busy} disabled={disabled || busy || views.length === 0}>Issue access link</Button>
        </form>
      )}
      {grants.map(grant => (
        <div key={grant.id} className="space-y-4 rounded-xl border border-gray-border bg-surface-inset p-4" aria-live="polite">
          <div className="space-y-1">
            <p className="text-sm font-medium">{grant.status === "active" ? `Link for ${grant.recipientEmail}` : `Access revoked for ${grant.recipientEmail}`}</p>
            <p className="text-xs text-gray-muted">Expires {new Date(grant.expiresAt).toLocaleString()}</p>
          </div>
          <p className="break-all text-sm"><a className="underline" href={`/apps/${workId}`}>{`/apps/${workId}`}</a></p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</Button>
            {grant.status === "active" ? <Button type="button" variant="danger" disabled={busy} onClick={() => void revoke(grant)}>Revoke link</Button> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
