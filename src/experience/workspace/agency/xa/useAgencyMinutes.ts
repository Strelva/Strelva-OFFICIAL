"use client";
import { useEffect, useMemo, useState } from "react";
import { agencyTimeListSchema } from "@/platform/care-reports/contracts";
import { currentCareMonth } from "@/platform/care-reports/model";
import type { AgencyClientRow } from "../../agency-clients";
import { clientMinutes, type ClientMinutes } from "./agency-xa-model";

/** Clients read per visit. Past this the Minutes page says it counted the first ones. */
export const MINUTES_CLIENT_LIMIT = 60;
const CONCURRENCY = 4;

export type AgencyMinutesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "off" }
  | { status: "error" }
  | { status: "ready"; rows: ClientMinutes[]; failed: string[]; partial: boolean };

/**
 * Time this month for each client, from the same agency-client-time read the
 * Care plan report uses (`/api/workspace/agency-client-time`). The route
 * answers 503 while care reports are off; then Minutes says so instead of
 * showing zeros. One client failing names that client and keeps the rest.
 */
export function useAgencyMinutes(request: typeof fetch, agencyWorkspaceId: string, clients: readonly AgencyClientRow[] | null, enabled = true): { state: AgencyMinutesState; retry: () => void } {
  const ready = useMemo(() => (clients ?? []).filter(client => client.status === "ready").slice(0, MINUTES_CLIENT_LIMIT), [clients]);
  const key = `${agencyWorkspaceId}:${ready.map(client => client.workspaceId).join(",")}`;
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<{ key: string; state: AgencyMinutesState } | null>(null);

  useEffect(() => {
    if (!enabled || clients === null) return;
    const controller = new AbortController();
    const storeKey = `${key}:${attempt}`;
    const month = currentCareMonth();
    const rows: ClientMinutes[] = [];
    const failed: string[] = [];
    let off = false;
    let index = 0;
    async function next(): Promise<void> {
      while (index < ready.length && !controller.signal.aborted && !off) {
        const client = ready[index++]!;
        try {
          const response = await request(`/api/workspace/agency-client-time?${new URLSearchParams({ agencyWorkspaceId, workspaceId: client.workspaceId, month })}`, { credentials: "same-origin", signal: controller.signal });
          if (response.status === 503) { off = true; return; }
          const parsed = response.ok ? agencyTimeListSchema.safeParse(await response.json()) : null;
          if (parsed?.success) rows.push(clientMinutes(client.workspaceId, client.name, parsed.data));
          else failed.push(client.name);
        } catch {
          if (!controller.signal.aborted) failed.push(client.name);
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, ready.length || 1) }, () => next())).then(() => {
      if (controller.signal.aborted) return;
      const order = new Map(ready.map((client, position) => [client.workspaceId, position]));
      const state: AgencyMinutesState = off ? { status: "off" }
        : ready.length && failed.length === ready.length ? { status: "error" }
          : { status: "ready", rows: rows.sort((a, b) => b.minutes - a.minutes || (order.get(a.workspaceId)! - order.get(b.workspaceId)!)), failed, partial: (clients ?? []).length > ready.length };
      setStored({ key: storeKey, state });
    });
    return () => controller.abort();
  }, [request, agencyWorkspaceId, key, ready, clients, enabled, attempt]);

  const state: AgencyMinutesState = !enabled ? { status: "idle" } : stored?.key === `${key}:${attempt}` ? stored.state : { status: "loading" };
  return { state, retry: () => setAttempt(value => value + 1) };
}
