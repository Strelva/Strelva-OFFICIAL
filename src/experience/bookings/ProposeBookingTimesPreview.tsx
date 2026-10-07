"use client";
import { ProposeBookingTimes } from "./ProposeBookingTimes";
import type { InquiryProposalOptions } from "@/products/bookings/contracts";
const OPTIONS: InquiryProposalOptions = {
  customer: { name: "Dana Reed", email: "dana@example.test" }, services: [{ id: "consultation", name: "Consultation", durationMinutes: 30 }], serviceId: "consultation", timeZone: "America/New_York", paused: false,
  slots: ["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].flatMap((date) => [15, 17, 19].map((hour) => {
    const start = `${date}T${hour}:00:00Z`; return { start, end: new Date(Date.parse(start) + 1800000).toISOString() };
  })),
};
export function ProposeBookingTimesPreview({ state = "ready" }: { state?: string }) {
  const data = state === "empty" ? { ...OPTIONS, slots: [] } : state === "paused" ? { ...OPTIONS, paused: true, slots: [] } : state === "no-services" ? { ...OPTIONS, services: [], serviceId: null, slots: [] } : OPTIONS;
  const phase = ["idle", "loading", "permission", "error", "accepted", "suppressed", "unavailable"].includes(state) ? state as "idle" | "loading" | "permission" | "error" | "accepted" | "suppressed" | "unavailable" : "ready";
  return <ProposeBookingTimes key={state} workspaceId="cf000000-0000-4000-8000-000000000001" tenantId="fictional" inquiryId="fictional-inquiry" customerName="Dana Reed"
    initial={{ phase, options: phase === "loading" ? undefined : data, selected: ["ready", "accepted", "suppressed", "unavailable"].includes(state) ? [OPTIONS.slots[0]!.start, OPTIONS.slots[2]!.start] : [], ...(phase === "error" ? { error: "Open times couldn't be read. Reload to try again." } : {}) }}
    request={async (_input, init) => new Response(JSON.stringify(init?.method === "POST" ? { delivery: state === "suppressed" ? "suppressed" : state === "unavailable" ? "unavailable" : "accepted" } : data), { status: 200, headers: { "content-type": "application/json" } })} />;
}
