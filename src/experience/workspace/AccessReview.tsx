"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { accessReviewSchema, type AccessReview, type AccessReviewRevoke, type AccessReviewScope } from "@/platform/access-review/contracts";
const kindLabel = { member: "Member", delegation: "Read-only delegation", operational_assignment: "Operating assignment", agency_assignment: "Agency staff assignment", provider: "Provider of record", provider_seat: "Provider seat", agent_token: "Agent token" };
export function AccessReviewView({ review, pending, notice, onRevoke }: { review: AccessReview; pending?: string | null; notice?: string; onRevoke: (input: AccessReviewRevoke) => void }) {
  return <div className="space-y-8">
    {review.organization ? <p className="text-sm text-gray-muted">Includes this workspace and active mapped businesses where you are a current member. {review.inaccessibleUnits ? `${review.inaccessibleUnits} mapped business${review.inaccessibleUnits === 1 ? " is" : "es are"} unavailable to your account; their access details are excluded.` : "All mapped businesses are accessible to your account."} Mapping a business never grants access.</p> : null}
    {notice ? <p role="status" className="text-sm text-gray-muted">{notice}</p> : null}
    {review.units.map(unit => <section key={unit.workspaceId} aria-label={`${unit.name} access`}>
      <h2 className="text-xl font-medium text-warm-black">{unit.name}</h2>
      <p className="mt-2 text-sm text-gray-muted">Your role: {unit.role}. Owners are protected. {unit.role === "member" ? "Only an owner or administrator can revoke access." : "Revocations are recorded in audit."}</p>
      {unit.entries.length ? <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{unit.entries.map(entry => <li key={`${entry.kind}:${entry.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="break-words text-sm font-medium text-warm-black">{entry.label}</p><p className="mt-1 text-sm text-gray-muted">{kindLabel[entry.kind]} · {entry.status}</p><p className="mt-1 text-xs text-gray-muted">Last use: {entry.lastUsedAt ? new Date(entry.lastUsedAt).toLocaleString() : "Not recorded"}</p>{entry.kind === "provider" && entry.status === "active" && unit.role === "owner" && !entry.canRevoke ? <a className="mt-2 inline-block text-sm text-accent-text underline" href={`/workspace/provider-change?workspaceId=${encodeURIComponent(unit.workspaceId)}`}>Review provider change notice</a> : null}</div>
        {entry.canRevoke ? <Button variant="danger" size="lg" className="shrink-0" loading={pending === `${unit.workspaceId}:${entry.kind}:${entry.id}`} disabled={Boolean(pending)} aria-label={`Revoke ${kindLabel[entry.kind].toLowerCase()} for ${entry.label}`} onClick={() => onRevoke({ workspaceId: review.workspaceId, organization: review.organization, businessId: unit.workspaceId, kind: entry.kind, recordId: entry.id })}>Revoke</Button> : null}
      </li>)}</ul> : <p className="mt-4 text-sm text-gray-muted">No access records.</p>}
    </section>)}
    <p className="text-xs text-gray-muted">Only tokens with current membership and an active native grant are listed. Last use is recorded for agent reads/proposals; other access types have no use tracking.</p>
  </div>;
}
export function AccessReviewPage({ workspaceId }: { workspaceId: string }) {
  const [organization, setOrganization] = useState(false);
  const scopeKey = `${workspaceId}:${organization}`;
  return <AccessReviewLoader key={scopeKey} scope={{ workspaceId, organization }} onScopeChange={setOrganization} />;
}
function AccessReviewLoader({ scope, onScopeChange }: { scope: AccessReviewScope; onScopeChange: (value: boolean) => void }) {
  const [review, setReview] = useState<AccessReview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const alive = useRef(false);
  async function load(signal?: AbortSignal) {
    const response = await fetch(`/api/workspace/access-review?workspaceId=${encodeURIComponent(scope.workspaceId)}&organization=${scope.organization}`, { cache: "no-store", signal });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Access review is unavailable.");
    const parsed = accessReviewSchema.parse(value);
    if (parsed.workspaceId !== scope.workspaceId || parsed.organization !== scope.organization) throw new Error("The access review response did not match this workspace.");
    if (alive.current) { setReview(parsed); setError(""); }
  }
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    void load(controller.signal).catch(cause => { if (alive.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Access review is unavailable."); });
    return () => { alive.current = false; controller.abort(); };
  // The parent remounts this loader for the exact workspace and review scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function revoke(input: AccessReviewRevoke) {
    setPending(`${input.businessId}:${input.kind}:${input.recordId}`); setNotice(""); setError("");
    try {
      const response = await fetch("/api/workspace/access-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Access could not be revoked.");
      if (!alive.current) return;
      setNotice(result.changed ? "Access revoked and recorded in audit." : "This access was already removed.");
      await load();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Access could not be revoked."); }
    finally { if (alive.current) setPending(null); }
  }
  return <main className="min-h-dvh bg-canvas px-6 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-4xl">
    <a href={`/workspace?workspaceId=${encodeURIComponent(scope.workspaceId)}&view=access`} className="text-sm text-accent-text underline">Back to workspace</a>
    <h1 className="mt-6 font-display text-3xl">People & access review</h1>
    <div className="my-6 flex flex-wrap gap-3"><Button variant={scope.organization ? "secondary" : "primary"} disabled={Boolean(pending)} onClick={() => onScopeChange(false)}>This business</Button>{review?.units.find(unit => unit.workspaceId === scope.workspaceId)?.role !== "member" ? <Button variant={scope.organization ? "primary" : "secondary"} disabled={Boolean(pending)} onClick={() => onScopeChange(true)}>Organization & mapped businesses</Button> : null}</div>
    {error ? <div className="mb-6"><p role="alert" className="text-sm text-critical">{error}</p><Button className="mt-3" variant="secondary" onClick={() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Access review is unavailable.")); }}>Retry</Button></div> : null}
    {review ? <AccessReviewView review={review} pending={pending} notice={notice} onRevoke={input => void revoke(input)} /> : !error ? <p role="status" className="text-sm text-gray-muted">Loading access review…</p> : null}
  </div></main>;
}
