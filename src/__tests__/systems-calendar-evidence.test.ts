import { describe, expect, it, vi } from "vitest";
import { systemsFromExisting, type ExistingSystemsSnapshot } from "@/platform/systems";
import { projectWorkspaceSystems } from "@/experience/systems/server";
import { readBookingCalendarEvidence } from "@/experience/systems/calendar-evidence";
import type { CalendarConnection } from "@/products/scheduling/calendar/contracts";

const BUSINESS = "5e000000-0000-4000-8000-000000000010";
const WORK = "5e000000-0000-4000-8000-0000000000a3";
const CALENDAR = "5e000000-0000-4000-8000-0000000000e1";
const TENANT = "5e000000-0000-4000-8000-0000000000b1";
const AT = "2026-10-08T12:00:00+00:00";
const NOW = Date.parse(AT);
const owner = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "calendar-owner@example.test" };
const snapshot: ExistingSystemsSnapshot = {
  businessId: BUSINESS,
  savedWork: [{ id: WORK, productId: "scheduling", resourceKind: "schedule", title: "Tastings", createdAt: AT, updatedAt: AT }],
  managedWebsites: [], inquiryWorkspaces: [],
  bookingGrants: [{ id: "5e000000-0000-4000-8000-0000000000d1", tenantStableId: TENANT, workId: WORK, displayName: "Book a tasting", provider: "google", status: "published" }],
  calendarConnections: [{ id: CALENDAR, provider: "google", calendarName: "Front desk", status: "connected" }],
};
const calendar = (extra: Partial<CalendarConnection> = {}): CalendarConnection => ({
  id: CALENDAR, workspaceId: BUSINESS, provider: "google", calendarId: "front-desk", calendarName: "Front desk", timeZone: "America/New_York", status: "connected", scopes: ["calendar"], reminderPolicy: { mode: "off" }, tokenExpiresAt: AT, lastCheckedAt: AT, lastError: null, createdAt: AT, updatedAt: AT, ...extra,
});
async function projection(rows: CalendarConnection[] | null, graph = systemsFromExisting(snapshot)) {
  const reader = vi.fn(async () => { if (rows === null) throw new Error("unavailable"); return rows; });
  const observations = await readBookingCalendarEvidence(graph, owner, NOW, reader);
  const result = await projectWorkspaceSystems({ listing: graph, siteDomains: new Map(), candidates: [], observations, actorId: owner.userId, now: NOW });
  return { result, observations, reader };
}
const state = (result: Awaited<ReturnType<typeof projectWorkspaceSystems>>) => result.connections.find(item => item.kind === "read")?.state;

describe("Selected booking calendar evidence in the live Systems projection", () => {
  it("requires fresh dated verification of the exact selected binding", async () => {
    const fresh = await projection([calendar()]);
    expect(state(fresh.result)).toBe("connected");
    expect(fresh.reader).toHaveBeenCalledExactlyOnceWith(owner, BUSINESS);
    expect(fresh.observations).toMatchObject([{ subjectId: CALENDAR, observedAt: AT, outcome: "pass" }]);
    const stale = await projection([calendar({ lastCheckedAt: "2026-09-30T12:00:00+00:00", updatedAt: AT })]);
    expect(state(stale.result)).toBe("stale");
    expect(stale.result.systems[0]!.lifecycle).toBe(fresh.result.systems[0]!.lifecycle);
  });
  it.each([null, "invalid", "2026-10-09T12:00:00+00:00"])("cannot use updatedAt instead of a valid last check: %s", async lastCheckedAt => {
    const { result, observations } = await projection([calendar({ lastCheckedAt, updatedAt: AT })]);
    expect(state(result)).toBe("stale");
    expect(observations[0]).toMatchObject({ outcome: "unknown", observedAt: null });
  });
  it("keeps an unreadable source unknown rather than claiming a connection or a revocation", async () => {
    const { result, observations } = await projection(null);
    expect(state(result)).toBe("stale");
    expect(observations[0]).toMatchObject({ outcome: "unknown", observedAt: null });
  });
  it("uses current missing, revoked and authorized status even when the previous check is old", async () => {
    for (const rows of [[], [calendar({ status: "revoked", lastCheckedAt: "2026-09-01T12:00:00Z" })], [calendar({ status: "authorized" })]]) {
      expect(state((await projection(rows)).result)).toBe("disconnected");
    }
  });
  it("shows provider errors as stale without surfacing raw provider details", async () => {
    const { result, observations } = await projection([calendar({ status: "error", lastError: "private provider response" })]);
    expect(state(result)).toBe("stale");
    expect(JSON.stringify(observations)).not.toContain("private provider response");
  });
  it("never borrows fresh evidence from another binding or business", async () => {
    for (const extra of [{ id: "5e000000-0000-4000-8000-0000000000e2" }, { workspaceId: "5e000000-0000-4000-8000-000000000099" }]) {
      expect(state((await projection([calendar(extra)])).result)).toBe("disconnected");
    }
  });
  it("preserves structural restrictions and skips assigned-work snapshots entirely", async () => {
    const restricted = systemsFromExisting({ ...snapshot, calendarConnections: snapshot.calendarConnections.map(item => ({ ...item, status: "revoked" as const })) });
    expect(state((await projection([calendar()], restricted)).result)).toBe("disconnected");
    const assigned = systemsFromExisting({ ...snapshot, scope: "assigned" });
    const { observations, reader, result } = await projection([calendar()], assigned);
    expect(observations).toEqual([]);
    expect(reader).not.toHaveBeenCalled();
    expect(result.connections).toEqual([]);
  });
  it("does not read calendars for unrelated Systems or disconnected published grants", async () => {
    const graph = systemsFromExisting({ ...snapshot, bookingGrants: snapshot.bookingGrants.map(item => ({ ...item, status: "revoked" as const })) });
    const { reader, observations } = await projection([calendar()], graph);
    expect(reader).not.toHaveBeenCalled();
    expect(observations).toEqual([]);
  });
});
