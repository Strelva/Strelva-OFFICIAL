"use client";

import { useState } from "react";
import { StLabel, StNotice, StRow, StRows, StSegmented } from "@/components/ui/strelva/Kit";
import type { ReportCadence } from "@/lib/report-cadence";
import type { ReplyMode } from "@/lib/reviews/reply-voice";
import type { ContentAutonomy } from "@/lib/content-autonomy";
import type { ClientEmailOverride } from "@/platform/infra/email/client-override";

/** Platform reporting and email controls, alongside read-only client policy. */
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

type OperatorSettingKey = "reportCadence" | "clientEmail";

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
  const [clientEmail, setClientEmail] = useState(initial.clientEmail);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      revert();
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  return <details>
    <summary className="cursor-pointer text-sm font-medium">Additional client settings</summary>
    <div className="mt-4 space-y-5">
      <StLabel>Platform reporting and email controls. Client policies are shown for read-only support.</StLabel>
      <StRows label="Additional client settings">
        <Row label="Report cadence" hint="How often reports are due for this client.">
          <Segmented value={reportCadence} disabled={busy === "reportCadence"} options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} onSelect={value => {
            const previous = reportCadence;
            void postSetting("reportCadence", value, setReportCadence, () => setReportCadence(previous));
          }} />
        </Row>
        <Row label="Review replies" hint="Recorded client policy. Support cannot change it.">{initial.replyMode}</Row>
        <Row label="Content changes" hint="Recorded client policy. Support cannot change it.">{initial.contentAutonomy}</Row>
        <Row label="Client email setting" hint={globalClientEmailPaused ? "Owner emails are off globally during rollout. This setting cannot enable them here." : "Use the global setting, enable for this client, or silence this client."}>
          <Segmented value={clientEmail} disabled={busy === "clientEmail"} disabledValues={globalClientEmailPaused ? ["on"] : []} options={[{ value: "inherit", label: "Follow global" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} onSelect={value => {
            const previous = clientEmail;
            void postSetting("clientEmail", value, setClientEmail, () => setClientEmail(previous));
          }} />
        </Row>
      </StRows>
      <StRows label="Recorded client configuration">
        <Row label="Publish after repeated approvals">{initial.autoApproveThreshold ?? "Off"}</Row>
        <Row label="Google Place ID">{initial.googlePlaceId || "Not recorded"}</Row>
        <Row label="Yelp business ID">{initial.yelpBusinessId || "Not recorded"}</Row>
        <Row label="Visibility trade">{initial.visibilityTrade || "Not recorded"}</Row>
        <Row label="Visibility towns">{initial.visibilityTowns || "Not recorded"}</Row>
      </StRows>
      {error && <StNotice tone="critical">{error}</StNotice>}
    </div>
  </details>;
}
