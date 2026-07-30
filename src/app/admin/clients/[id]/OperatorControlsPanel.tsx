"use client";

import { useState } from "react";
import { Panel } from "@/app/admin/console";
import { Field } from "@/app/admin/ui";
import type { ReportCadence } from "@/lib/report-cadence";
import type { ReplyMode } from "@/lib/reviews/reply-voice";
import type { ContentAutonomy } from "@/lib/content-autonomy";
import type { ClientEmailOverride } from "@/lib/client-email-override";

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

const labelCls = "text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-faint";

function Segmented<T extends string>({
  value,
  options,
  onSelect,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border border-glass-border bg-surface-base/40 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(o.value)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-40 ${
              active
                ? "bg-accent text-on-accent"
                : "text-gray-muted hover:text-warm-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={labelCls}>{label}</p>
      {children}
      {hint && <p className="text-[11px] leading-snug text-gray-faint">{hint}</p>}
    </div>
  );
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
        setError("Auto-approve threshold must be a number between 0 and 50 (0 or empty = off).");
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
  const btnCls =
    "rounded-md border border-glass-border px-3 py-1.5 text-xs font-medium text-gray-muted transition-colors hover:border-gray-border hover:text-warm-white disabled:opacity-40";

  return (
    <Panel title="Operator controls" bodyClassName="px-[18px] pb-[18px] pt-1 space-y-5">
      <p className="text-[12px] leading-relaxed text-gray-muted">
        Founder-only per-client overrides. Every change here is audit-logged.
      </p>

      {/* Redis-backed, auto-save-on-click */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Row label="Report cadence" hint="How often the report cron emails this client.">
          <Segmented
            value={reportCadence}
            disabled={busy === "reportCadence"}
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
            onSelect={(v) => {
              const prev = reportCadence;
              void postSetting("reportCadence", v, setReportCadence, () => setReportCadence(prev));
            }}
          />
        </Row>

        <Row label="Review replies" hint="Off · draft-only (approve) · auto-post after the safety window.">
          <Segmented
            value={replyMode}
            disabled={busy === "replyMode"}
            options={[
              { value: "off", label: "Off" },
              { value: "approve", label: "Draft only" },
              { value: "auto", label: "Auto-post" },
            ]}
            onSelect={(v) => {
              const prev = replyMode;
              void postSetting("replyMode", v, setReplyMode, () => setReplyMode(prev));
            }}
          />
        </Row>

        <Row label="AI content" hint="Auto-publish only ever touches low-risk copy — never hours, prices, or contact details.">
          <Segmented
            value={contentAutonomy}
            disabled={busy === "contentAutonomy"}
            options={[
              { value: "approve", label: "Draft everything" },
              { value: "auto", label: "Auto-publish low-risk" },
            ]}
            onSelect={(v) => {
              const prev = contentAutonomy;
              void postSetting("contentAutonomy", v, setContentAutonomy, () => setContentAutonomy(prev));
            }}
          />
        </Row>

        <Row
          label="Client email"
          hint={
            globalClientEmailPaused
              ? "Global client email is currently PAUSED. Force ON arms this one verified client anyway."
              : "Global client email is on. Force OFF silences this one client."
          }
        >
          <Segmented
            value={clientEmail}
            disabled={busy === "clientEmail"}
            options={[
              { value: "inherit", label: "Inherit global" },
              { value: "on", label: "Force ON" },
              { value: "off", label: "Force OFF" },
            ]}
            onSelect={(v) => {
              const prev = clientEmail;
              void postSetting("clientEmail", v, setClientEmail, () => setClientEmail(prev));
            }}
          />
        </Row>
      </div>

      {/* TenantConfig fields — explicit Save (PATCH) */}
      <div className="space-y-4 border-t border-glass-border pt-4">
        <Row
          label="Auto-approve after N approvals"
          hint="After N consecutive approved changes with no rejection, low-risk AI edits auto-promote. 0 or empty = off."
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={50}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="off"
              className="w-24 rounded-md border border-glass-border bg-gray-bg px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:border-accent/50 focus:outline-none"
            />
            <button type="button" onClick={saveThreshold} disabled={busy === "threshold"} className={btnCls}>
              {busy === "threshold" ? "Saving…" : `Save${savedTag("threshold")}`}
            </button>
          </div>
        </Row>

        <div className="space-y-2">
          <Field label="Google Place ID" value={googlePlaceId} onChange={setGooglePlaceId} placeholder="ChIJ…" />
          <Field label="Yelp Business ID" value={yelpBusinessId} onChange={setYelpBusinessId} placeholder="business-slug" />
          <button type="button" onClick={saveReviews} disabled={busy === "reviews"} className={btnCls}>
            {busy === "reviews" ? "Saving…" : `Save review IDs${savedTag("reviews")}`}
          </button>
        </div>

        <div className="space-y-2">
          <Field
            label="Visibility trade"
            value={visTrade}
            onChange={setVisTrade}
            placeholder="plumber, HVAC, electrician…"
          />
          <Field
            label="Visibility towns (comma-separated)"
            value={visTowns}
            onChange={setVisTowns}
            placeholder="Buffalo, NY, Cheektowaga, NY"
          />
          <button type="button" onClick={saveVisibility} disabled={busy === "visibility"} className={btnCls}>
            {busy === "visibility" ? "Saving…" : `Save visibility${savedTag("visibility")}`}
          </button>
          <p className="text-[11px] leading-snug text-gray-faint">
            Sending the visibility block replaces the stored trade + towns. Competitors and queries-per-week are
            left untouched by this panel.
          </p>
        </div>
      </div>

      {error && <p className="text-[12px] text-critical">{error}</p>}
    </Panel>
  );
}
