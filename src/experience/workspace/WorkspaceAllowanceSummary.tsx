"use client";

import { Gauge, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { WorkAllowanceInspection, WorkAllowanceRecord } from "@/platform/work-economics/allowances";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import styles from "./workspace-allowance.module.css";

type AllowanceResponse = WorkAllowanceInspection & { currentActorId: string };
type State =
  | { status: "loading" }
  | { status: "ready"; value: AllowanceResponse; acceptingId?: string; error?: string }
  | { status: "error"; message: string };

function responseError(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function money(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cents / 100);
}

function period(allowance: WorkAllowanceRecord): string {
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(allowance.periodStart))} to ${format.format(new Date(allowance.periodEnd))}`;
}

function unitSummary(bucket: WorkAllowanceRecord["buckets"][number]): string {
  const label = bucket.unitKind.replaceAll("_", " ");
  return `${bucket.availableUnits} ${label}${bucket.availableUnits === 1 ? "" : "s"} available`;
}

export function WorkspaceAllowanceSummary({ businessId, enabled, compact = false, onOpenSettings }: { businessId: string; enabled: boolean; compact?: boolean; onOpenSettings?: () => void }) {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    if (!enabled) return;
    setState({ status: "loading" });
    try {
      const response = await request(`/api/work-allowances?workspaceId=${encodeURIComponent(businessId)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(value, "Work allowances could not be loaded."));
      setState({ status: "ready", value: value as AllowanceResponse });
    } catch (cause) {
      setState({ status: "error", message: cause instanceof Error ? cause.message : "Work allowances could not be loaded." });
    }
  }, [businessId, enabled, request]);

  useEffect(() => { void load(); }, [load]);
  if (!enabled) return null;

  async function accept(allowanceId: string) {
    if (state.status !== "ready" || state.acceptingId) return;
    setState({ ...state, acceptingId: allowanceId, error: undefined });
    try {
      const response = await request("/api/work-allowances/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "accept_spending_cap", allowanceId }),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(value, "The spending cap could not be accepted."));
      setState({ status: "ready", value: value as AllowanceResponse });
    } catch (cause) {
      setState((current) => current.status === "ready" ? {
        ...current,
        acceptingId: undefined,
        error: cause instanceof Error ? cause.message : "The spending cap could not be accepted.",
      } : current);
    }
  }

  if (compact) {
    const pending = state.status === "ready" ? state.value.allowances.find((allowance) => allowance.status === "pending_cap_acceptance") : undefined;
    const pendingForActor = Boolean(pending && state.status === "ready" && pending.payerId === state.value.currentActorId);
    const message = state.status === "loading"
      ? "Review allowance and payer details in Settings."
      : state.status === "error"
        ? "Allowance status is unavailable. Review it in Settings."
        : pendingForActor
          ? "Cap needs your acceptance."
          : pending
            ? "Work allowance is pending acceptance."
            : "Review allowance and payer details in Settings.";
    const detail = pending
      ? "Review the cap and payer details in Settings before starting work."
      : state.status === "error"
        ? state.message
        : undefined;
    return <section className={`${styles.panel} ${styles.compactPanel}`} aria-labelledby="home-allowance">
      <header><Gauge size={17} aria-hidden="true" /><h2 id="home-allowance">Work allowance</h2></header>
      <p className={styles.compactNotice} role={pending ? "alert" : state.status === "loading" || state.status === "error" ? "status" : undefined}><strong>{message}</strong>{detail ? <span>{detail}</span> : null}<span className={styles.compactPolicy}>Allowance records are not synchronized to subscription billing.</span></p>
      {onOpenSettings ? <button type="button" onClick={onOpenSettings}>Open Settings</button> : null}
    </section>;
  }

  if (state.status === "loading") return <section className={styles.panel} aria-labelledby="home-allowance"><header><Gauge size={17} aria-hidden="true" /><h2 id="home-allowance">Work allowance</h2></header><p role="status">Loading allowance…</p></section>;
  if (state.status === "error") return <section className={styles.panel} aria-labelledby="home-allowance"><header><Gauge size={17} aria-hidden="true" /><h2 id="home-allowance">Work allowance</h2></header><p>Allowance records are unavailable. Installed offerings and saved work are unchanged.</p><button type="button" onClick={() => void load()}><RefreshCw size={13} aria-hidden="true" />Try again</button></section>;
  if (!state.value.allowances.length) return null;

  return <section className={styles.panel} aria-labelledby="home-allowance">
    <header><Gauge size={17} aria-hidden="true" /><h2 id="home-allowance">Work allowance</h2><span>{state.value.allowances.length}</span></header>
    <ul>{state.value.allowances.map((allowance) => {
      const canAccept = allowance.status === "pending_cap_acceptance" && allowance.payerId === state.value.currentActorId;
      return <li key={allowance.id}>
        <div className={styles.allowanceHead}><strong>{allowance.status === "pending_cap_acceptance" ? "Cap needs your acceptance" : allowance.status === "closed" ? "Closed period" : "Active period"}</strong><small>{period(allowance)}</small></div>
        <dl><div><dt>Operational cap</dt><dd>{money(allowance.spendingCapCents)}</dd></div><div><dt>Recorded cost</dt><dd>{money(allowance.actualCostCents)}</dd></div></dl>
        <p>{allowance.buckets.map(unitSummary).join(" · ")}</p>
        {canAccept ? <button type="button" disabled={Boolean(state.acceptingId)} onClick={() => void accept(allowance.id)}>{state.acceptingId === allowance.id ? "Accepting…" : `Accept ${money(allowance.spendingCapCents)} cap`}</button> : null}
      </li>;
    })}</ul>
    <p className={styles.policy}>Locally configured. This cap limits operational cost; it is not an invoice price and is not synchronized to subscription billing.</p>
    {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
  </section>;
}
