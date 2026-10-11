"use client";
import { useEffect, useRef, useState } from "react";
import { StEmpty, StHead, StMono, StNotice, StPage, StSection, StSegmented, StSkeleton, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { StTable } from "@/components/ui/strelva/Table";
import { accessReviewSchema, type AccessReview, type AccessReviewRevoke, type AccessReviewScope } from "@/platform/access-review/contracts";
const kindLabel = { member: "Member", delegation: "Read-only delegation", operational_assignment: "Operating assignment", agency_assignment: "Agency staff assignment", provider: "Provider of record", provider_seat: "Provider seat", agent_token: "Assistant connection" };
export function AccessReviewView({ review, pending, notice, onRevoke }: { review: AccessReview; pending?: string | null; notice?: string; onRevoke: (input: AccessReviewRevoke) => void }) {
  return <div className="grid gap-8">
    {review.organization ? <p className="text-sm text-gray-muted">Includes this workspace and active mapped businesses where you are a current member. {review.inaccessibleUnits ? `${review.inaccessibleUnits} mapped business${review.inaccessibleUnits === 1 ? " is" : "es are"} unavailable to your account; their access details are excluded.` : "All mapped businesses are accessible to your account."} Mapping a business never grants access.</p> : null}
    {notice ? <StToast>{notice}</StToast> : null}
    {review.units.map(unit => <StSection key={unit.workspaceId} title={unit.name}>
      <p className="text-sm text-gray-muted">Your role: {unit.role}. Owners are protected. {unit.role === "member" ? "Only an owner or administrator can revoke access." : "Revocations are recorded in audit."}</p>
      {unit.entries.length ? <StTable label={`${unit.name} access`} rows={unit.entries} rowKey={entry => `${entry.kind}:${entry.id}`} columns={[
        { key: "person", label: "Person or connection", render: entry => <>{entry.label}{entry.kind === "provider" && entry.status === "active" && unit.role === "owner" && !entry.canRevoke ? <div><StTextButton href={`/workspace/provider-change?workspaceId=${encodeURIComponent(unit.workspaceId)}`}>Review agency change notice</StTextButton></div> : null}</> },
        { key: "access", label: "Access", render: entry => kindLabel[entry.kind] },
        { key: "status", label: "State", render: entry => entry.status },
        { key: "last", label: "Last use", render: entry => entry.lastUsedAt ? <StMono as="time" dateTime={entry.lastUsedAt}>{new Date(entry.lastUsedAt).toLocaleString()}</StMono> : "Not recorded" },
        { key: "decision", label: "Review", render: entry => entry.canRevoke ? <StTextButton tone="danger" disabled={Boolean(pending)} aria-busy={pending === `${unit.workspaceId}:${entry.kind}:${entry.id}` || undefined} aria-label={`Revoke ${kindLabel[entry.kind].toLowerCase()} for ${entry.label}`} onClick={() => onRevoke({ workspaceId: review.workspaceId, organization: review.organization, businessId: unit.workspaceId, kind: entry.kind, recordId: entry.id })}>{pending === `${unit.workspaceId}:${entry.kind}:${entry.id}` ? "Removing…" : "Remove"}</StTextButton> : entry.status === "owner" ? "Protected owner" : "Read only" },
      ]} /> : <StEmpty>No access records.</StEmpty>}
    </StSection>)}
    <StNotice>Only connections with current membership and an active native grant are listed. Last use is recorded for assistant reads and proposals; other access types have no use tracking.</StNotice>
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
  return <main data-workspace-theme="linen" className="min-h-dvh bg-canvas text-warm-black" style={{ fontFamily: "var(--font-workspace, system-ui)" }}><StPage width="wide">
    <StHead crumb={{ label: "Workspace", href: `/workspace?workspaceId=${encodeURIComponent(scope.workspaceId)}&view=access` }} title="People & access review" meta="Review who can see or change each business. Removing access is recorded in audit." />
    <StSegmented label="Review scope" value={scope.organization ? "organization" : "business"} options={[{ value: "business", label: "This business" }, ...(review?.units.find(unit => unit.workspaceId === scope.workspaceId)?.role !== "member" ? [{ value: "organization", label: "Organization and mapped businesses" }] : [])]} onChange={value => onScopeChange(value === "organization")} disabledValues={pending ? ["business", "organization"] : []} disabledReason="Wait for the current access change to finish." />
    {error ? <div className="grid gap-3"><StNotice tone="critical">{error}</StNotice><StTextButton onClick={() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Access review is unavailable.")); }}>Retry</StTextButton></div> : null}
    {review ? <AccessReviewView review={review} pending={pending} notice={notice} onRevoke={input => void revoke(input)} /> : !error ? <StSection title="Access records"><StSkeleton label="Loading access review" /><StSkeleton width="65%" /></StSection> : null}
  </StPage></main>;
}
