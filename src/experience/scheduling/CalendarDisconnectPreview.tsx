"use client";
import { useCallback, useRef } from "react";
import { CalendarConnectionPanel } from "./CalendarConnectionPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { outlookCalendarConsentAction, type CalendarConnection } from "@/products/scheduling/contracts";

/** Synthetic disconnect responses only; this callback never uses fetch. */
export function CalendarDisconnectPreview({ state }: { state: string }) {
  const disconnected = useRef(false);
  const request = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const connection: CalendarConnection = {
      id: "cf000000-0000-4000-8000-000000000002", workspaceId: "cf000000-0000-4000-8000-000000000001",
      provider: state === "google-error" ? "google" : "outlook", status: "connected", calendarId: "fictional-calendar", calendarName: "Consultation calendar", timeZone: "America/New_York", scopes: [], reminderPolicy: { mode: "off" }, tokenExpiresAt: null, lastCheckedAt: null, lastError: null, createdAt: "2026-10-07T12:00:00Z", updatedAt: "2026-10-07T12:00:00Z",
    };

    if (!String(input).startsWith("/api/workspace/calendar-connections")) throw new Error("Outside fixture requests are blocked.");
    if (state === "loading") return new Promise<Response>(() => {});
    if (init?.method === "POST") {
      disconnected.current = true;
      return Response.json({ disconnected: true,
        ...(state === "google-error" ? { revocationOutcome: "failed" } : {}),
        ...(state === "google-error" ? {} : { providerConsentAction: outlookCalendarConsentAction }),
      });
    }
    if (disconnected.current && state === "reload-error") return Response.json({ error: "Connections could not be reloaded. Strelva disconnected successfully." }, { status: 503 });
    return Response.json({ connections: [{ ...connection, status: disconnected.current ? "revoked" : "connected" }] });
  }, [state]);
  return <WorkspaceRequestContext.Provider value={request}><CalendarConnectionPanel workspaceId="cf000000-0000-4000-8000-000000000001" /></WorkspaceRequestContext.Provider>;
}
