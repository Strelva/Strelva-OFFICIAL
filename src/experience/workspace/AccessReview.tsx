"use client";
import { useEffect, useRef, useState } from "react";
import { StPage, StHead, StSection, StRows, StRow, StTextButton, StEmpty, StNotice, StSkeleton, StState, StSegmented } from "@/components/ui/strelva/Kit";
import { accessReviewSchema, type AccessReview, type AccessReviewRevoke, type AccessReviewScope } from "@/platform/access-review/contracts";
const kindLabel = { member: "Member", delegation: "Read-only delegation", operational_assignment: "Operating assignment", agency_assignment: "Agency staff assignment", provider: "Provider of record", provider_seat: "Provider seat", agent_token: "Assistant connection" };
export function AccessReviewView({ review, pending, notice, onRevoke }: { review: AccessReview; pending?: string | null; notice?: string; onRevoke: (input: AccessReviewRevoke) => void }) {
  return <div className="space-y-8">
    {review.organization ? <StNotice>Includes this workspace and active mapped businesses where you are a current member. {review.inaccessibleUnits ? `${review.inaccessibleUnits} mapped business${review.inaccessibleUnits === 1 ? " is" : "es are"} unavailable to your account; their access details are excluded.` : "All mapped businesses are accessible to your account."} Mapping a business never grants access.</StNotice> : null}
    {notice ? <StNotice><span role="status">{notice}</span></StNotice> : null}
    {review.units.map(unit => <StSection key={unit.workspaceId} title={unit.name}>
      <p className="text-sm text-gray-muted">Your role: {unit.role}. Owners are protected. {unit.role === "member" ? "Only an owner or administrator can revoke access." : "Revocations are recorded in audit."}</p>
      {unit.entries.length ? <StRows>{unit.entries.map(entry => <StRow key={`${entry.kind}:${entry.id}`} title={entry.label} kind={kindLabel[entry.kind]} detail={`Last use: ${entry.lastUsedAt ? new Date(entry.lastUsedAt).toLocaleString() : "Not recorded"}`} end={<><StState kind={entry.status === "active" ? "live" : "draft"}>{entry.status}</StState>{entry.canRevoke ? <StTextButton tone="accent" disabled={Boolean(pending)} aria-label={`Revoke ${kindLabel[entry.kind].toLowerCase()} for ${entry.label}`} onClick={() => onRevoke({ workspaceId: review.workspaceId, organization: review.organization, businessId: unit.workspaceId, kind: entry.kind, recordId: entry.id })}>{pending === `${unit.workspaceId}:${entry.kind}:${entry.id}` ? "Revoking…" : "Revoke"}</StTextButton> : null}</>}>
        {entry.kind === "provider" && entry.status === "active" && unit.role === "owner" && !entry.canRevoke ? <StTextButton href={`/workspace/provider-change?workspaceId=${encodeURIComponent(unit.workspaceId)}`} tone="accent">Review provider change notice</StTextButton> : null}
      </StRow>)}</StRows> : <StEmpty>No access records.</StEmpty>}
    </StSection>)}
    <p className="text-sm text-gray-muted">Only connections with current membership and an active grant are listed. Last use is recorded for assistant reads and proposed changes; other access types have no use tracking.</p>
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
  return <StPage>
    <StHead title="People & access" crumb={{label: "Back to workspace", href: `/workspace?workspaceId=${encodeURIComponent(scope.workspaceId)}&view=access`}} />
    <StSegmented value={scope.organization ? "organization" : "business"} label="Access review scope" options={[{value: "business", label: "This business"}, {value: "organization", label: "Organization & mapped businesses"}]} disabledValues={pending ? ["business", "organization"] : review?.units.find(unit => unit.workspaceId === scope.workspaceId)?.role === "member" ? ["organization"] : []} disabledReason={pending ? "Wait for the current change." : "Only owners and administrators can review mapped businesses."} onChange={value => onScopeChange(value === "organization")} />
    {error ? <div><StNotice tone="critical">{error}</StNotice><StTextButton onClick={() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Access review is unavailable.")); }}>Retry</StTextButton></div> : null}
    {review ? <AccessReviewView review={review} pending={pending} notice={notice} onRevoke={input => void revoke(input)} /> : !error ? <StSkeleton label="Loading access review" /> : null}
  </StPage>;
}
