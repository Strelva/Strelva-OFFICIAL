"use client";
import { ManualBookingForm } from "./ManualBookingForm";
export function ManualBookingPreview({ state }: { state: string }) {
  return <ManualBookingForm workspaceId="cf000000-0000-4000-8000-000000000001" tenantId="fictional" request={async (_url, init) => {
    if (state === "loading") return new Promise<Response>(() => {});
    if (state === "permission" || state === "error") return new Response(JSON.stringify({ error: state === "permission" ? "These bookings belong to another business. Ask its owner to invite you." : "Open times couldn't be read. Nothing changed." }), { status: state === "permission" ? 403 : 503 });
    return new Response(JSON.stringify(init?.method === "POST" ? { booking: { status: "requested" }, created: true } : {
      timeZone: "America/New_York", paused: state === "paused", services: [{ id: "consultation", name: "Consultation", intake: [{ id: "reason", label: "What would you like to discuss?", required: true, type: "textarea" }] }],
      slots: state === "empty" || state === "paused" ? [] : [{ start: "2026-11-06T15:00:00Z", end: "2026-11-06T15:30:00Z" }, { start: "2026-11-09T19:00:00Z", end: "2026-11-09T19:30:00Z" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }} />;
}
