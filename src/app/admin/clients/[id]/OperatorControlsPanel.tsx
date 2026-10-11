"use client";

import { useState } from "react";
import { StInput, StLabel, StNotice, StPill, StRow, StRows, StSegmented, StSection } from "@/components/ui/strelva/Kit";
import type { ReportCadence } from "@/lib/report-cadence";
import type { ReplyMode } from "@/lib/reviews/reply-voice";
import type { ContentAutonomy } from "@/lib/content-autonomy";
import type { ClientEmailOverride } from "@/platform/infra/email/client-override";

/**
 * Operator controls — the founder's per-client override surface for settings
 * that are otherwise client-only, env-only, or unsettable. Every control is
 * super-admin gated (the route re-checks) and audit-logged.
 *
 * Two POST targets:
 *   • Redis-backed controls (cadence / replyMode / contentAutonomy / clientEmail)
 *     → POST /api/admin/tenants/[id]/operator-settings
 *   • TenantConfig fields (autoApproveThreshold / reviewsConfig / visibility)
 *     → PATCH /api/admin/tenants  { id, ...fields }
 *
 * Optimistic: the control moves immediately, reverts on error.
 */

export interface OperatorControlsInitial {
  reportCadence: ReportCadence;
  replyMode: ReplyMode;
  contentAutonomy: ContentAutonomy;
  clientEmail: ClientEmailOverride;
  autoApproveThreshold: number | null;
  googlePlaceId: string;
  yelpBusinessId: string;
  visibilityTrade: string;
  visibilityTowns: string; // comma-separated for the input
}

type OperatorSettingKey = "reportCadence" | "replyMode" | "contentAutonomy" | "clientEmail";

function Segmented<T extends string>({ value, options, onSelect, disabled, disabledValues = [] }: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  disabled?: boolean;
  disabledValues?: T[];
}) {
  return <StSegmented value={value} options={options} onChange={onSelect} label={options.map(option => option.label).join(" / ")} disabledValues={disabled ? options.map(option => option.value) : disabledValues} disabledReason={disabled ? "Saving the change." : "Owner emails are off globally during rollout."} />;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <StRow title={label} detail={hint} end={children} />;
}

export function OperatorControlsPanel({
  tenantId,
  initial,
  globalClientEmailPaused,
}: {
  tenantId: string;
  initial: OperatorControlsInitial;
  globalClientEmailPaused: boolean;
}) {
  // Redis-backed controls
  const [reportCadence, setReportCadence] = useState(initial.reportCadence);
  const [replyMode, setReplyMode] = useState(initial.replyMode);
  const [contentAutonomy, setContentAutonomy] = useState(initial.contentAutonomy);
  const [clientEmail, setClientEmail] = useState(initial.clientEmail);

  // TenantConfig fields (PATCH)
  const [threshold, setThreshold] = useState(
    initial.autoApproveThreshold == null ? "" : String(initial.autoApproveThreshold),
  );
  const [googlePlaceId, setGooglePlaceId] = useState(initial.googlePlaceId);
  const [yelpBusinessId, setYelpBusinessId] = useState(initial.yelpBusinessId);
  const [visTrade, setVisTrade] = useState(initial.visibilityTrade);
  const [visTowns, setVisTowns] = useState(initial.visibilityTowns);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function flashSaved(what: string) {
    setSaved(what);
    setTimeout(() => setSaved((s) => (s === what ? null : s)), 1800);
  }

  /** Optimistic single-key POST to the operator-settings route. Reverts on error. */
  async function postSetting<K extends OperatorSettingKey, V extends string>(
    key: K,
    next: V,
    apply: (v: V) => void,
    revert: () => void,
  ) {
    setError(null);
    apply(next);
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/operator-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      flashSaved(key);
    } catch (err) {
      revert();
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  /** PATCH the TenantConfig fields (threshold / reviewsConfig / visibility). */
  async function patchTenant(fields: Record<string, unknown>, tag: string) {
    setError(null);
    setBusy(tag);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tenantId, ...fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      flashSaved(tag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  function saveThreshold() {
    const trimmed = threshold.trim();
    let value: number | null;
    if (trimmed === "" || trimmed === "0") {
      value = null;
    } else {
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 0 || n > 50) {
        setError("Approval count must be a number between 0 and 50 (0 or empty = off).");
        return;
      }
      value = n;
    }
    void patchTenant({ autoApproveThreshold: value }, "threshold");
  }

  function saveReviews() {
    void patchTenant(
      {
        reviewsConfig: {
          googlePlaceId: googlePlaceId.trim() || undefined,
          yelpBusinessId: yelpBusinessId.trim() || undefined,
        },
      },
      "reviews",
    );
  }

  function saveVisibility() {
    const towns = visTowns
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    void patchTenant(
      { visibility: { trade: visTrade.trim(), towns } },
      "visibility",
    );
  }

  const savedTag = (tag: string) => (saved === tag ? " ✓" : "");

  return <details>
    <summary className="cursor-pointer text-sm font-medium">Additional client settings</summary>
    <div className="mt-4 space-y-5">
      <StLabel>Per-client settings. Every change names your signed-in operator account.</StLabel>
      <StRows label="Additional client settings">
        <Row label="Report cadence" hint="How often reports are due for this client.">
          <Segmented value={reportCadence} disabled={busy === "reportCadence"} options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} onSelect={value => {
            const previous = reportCadence;
            void postSetting("reportCadence", value, setReportCadence, () => setReportCadence(previous));
          }} />
        </Row>
        <Row label="Review replies" hint="Off, draft for review, or post after the safety window.">
          <Segmented value={replyMode} disabled={busy === "replyMode"} options={[{ value: "off", label: "Off" }, { value: "approve", label: "Draft only" }, { value: "auto", label: "Strelva posts" }]} onSelect={value => {
            const previous = replyMode;
            void postSetting("replyMode", value, setReplyMode, () => setReplyMode(previous));
          }} />
        </Row>
        <Row label="Content changes" hint="Strelva can publish low-risk copy. Hours, prices and contact details always need review.">
          <Segmented value={contentAutonomy} disabled={busy === "contentAutonomy"} options={[{ value: "approve", label: "Draft everything" }, { value: "auto", label: "Publish low-risk copy" }]} onSelect={value => {
            const previous = contentAutonomy;
            void postSetting("contentAutonomy", value, setContentAutonomy, () => setContentAutonomy(previous));
          }} />
        </Row>
        <Row label="Client email setting" hint={globalClientEmailPaused ? "Owner emails are off globally during rollout. This setting cannot enable them here." : "Use the global setting, enable for this client, or silence this client."}>
          <Segmented value={clientEmail} disabled={busy === "clientEmail"} disabledValues={globalClientEmailPaused ? ["on"] : []} options={[{ value: "inherit", label: "Follow global" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} onSelect={value => {
            const previous = clientEmail;
            void postSetting("clientEmail", value, setClientEmail, () => setClientEmail(previous));
          }} />
        </Row>
      </StRows>
      <StSection as="div" title="Publish after repeated approvals">
        <StInput type="number" label="Consecutive approvals" min={0} max={50} value={threshold} onChange={event => setThreshold(event.target.value)} placeholder="Off" hint="After this many consecutive approvals with no rejection, Strelva publishes low-risk copy. Zero or empty means off." />
        <StPill variant="soft" onClick={saveThreshold} disabled={busy === "threshold"}>{busy === "threshold" ? "Saving…" : `Save${savedTag("threshold")}`}</StPill>
      </StSection>
      <StSection as="div" title="Review sources">
        <StInput label="Google Place ID" value={googlePlaceId} onChange={event => setGooglePlaceId(event.target.value)} />
        <StInput label="Yelp business ID" value={yelpBusinessId} onChange={event => setYelpBusinessId(event.target.value)} />
        <StPill variant="soft" onClick={saveReviews} disabled={busy === "reviews"}>{busy === "reviews" ? "Saving…" : `Save review IDs${savedTag("reviews")}`}</StPill>
      </StSection>
      <StSection as="div" title="Visibility">
        <StInput label="Trade" value={visTrade} onChange={event => setVisTrade(event.target.value)} />
        <StInput label="Towns, separated by commas" value={visTowns} onChange={event => setVisTowns(event.target.value)} />
        <StPill variant="soft" onClick={saveVisibility} disabled={busy === "visibility"}>{busy === "visibility" ? "Saving…" : `Save visibility${savedTag("visibility")}`}</StPill>
        <StLabel>Replaces the stored trade and towns. Competitors and weekly query count stay as recorded.</StLabel>
      </StSection>
      {error && <StNotice tone="critical">{error}</StNotice>}
    </div>
  </details>;
}
