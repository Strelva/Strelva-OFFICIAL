import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Person } from "../../tests/support/journeys";

const ids = vi.hoisted(() => ({ workspace: "eeeeeeee-1000-4000-8000-000000000001", owner: "eeeeeeee-1000-4000-8000-000000000002",
  service: "eeeeeeee-1000-4000-8000-000000000003", system: "eeeeeeee-1000-4000-8000-000000000004" }));
vi.mock("../../tests/support/local-auth", () => ({ localEnvironment: () => ({ app: "http://127.0.0.1:3000" }) }));
vi.mock("@/platform/systems/supabase-store", () => ({ createSupabaseSystemStore: () => ({
  createSystem: async () => ({ id: ids.system, changeNumber: 1 }),
  recordRevision: async () => ({ system: { changeNumber: 2 } }),
  transitionLifecycle: async () => ({ lifecycle: "live" }),
}) }));
import { nativeBookingJourney } from "../../tests/support/native-booking-journey";

afterEach(() => vi.unstubAllEnvs());

describe("native booking setup follows the owner's own-write confirmation contract", () => {
  it("reads the real confirmed copy and requires no redundant pending facts decision", async () => {
    for (const key of ["STRELVA_LOCAL_AUTH_PROOF", "STRELVA_BOOKING_MANUAL", "STRELVA_BOOKING_MESSAGES", "STRELVA_BOOKING_MANAGE_PAGE"]) vi.stubEnv(key, "1");
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "false");
    let recordReads = 0;
    const rpc = vi.fn(async (name: string) => {
      const data = name === "read_business_record" ? { workspaceId: ids.workspace, revision: ++recordReads,
        services: recordReads === 1 ? [] : [{ id: ids.service, name: "Site visit", durationMinutes: 60, active: true, source: "owner" }] }
        : name === "patch_business_record" ? { revision: 2 }
        : name === "read_business_fact_review" ? null
        : name === "read_confirmed_business_facts" ? { revision: 2, facts: { display_name: "Native booking journey",
          hours: { timezone: "UTC", weekly: Array.from({ length: 7 }, (_, day) => ({ day, opens: "09:00", closes: "17:00" })) } }, services: [{ name: "Site visit" }] }
        : { workspaceId: ids.workspace, calendarKey: ids.workspace, tenantStableId: null, systemId: ids.system, paused: false, settings: null };
      return { data, error: null };
    });
    const get = vi.fn(async () => ({ status: () => 200, text: async () => "", json: async () => ({ items: [], complete: true }) }));
    const post = vi.fn(async () => ({ status: () => 200, text: async () => "", json: async () => ({ revision: 1 }) }));
    const owner = { userId: ids.owner, email: "fixture-owner@example.test", context: { request: { get, post } } } as unknown as Person;
    const journey = await nativeBookingJourney(owner, { rpc } as unknown as SupabaseClient, ids.workspace);
    expect(journey.approve).toBeTypeOf("function");
    expect(rpc.mock.calls.map(call => call[0])).toContain("read_confirmed_business_facts");
    expect(post.mock.calls).toHaveLength(1); // Settings; owner did not approve their own already-confirmed facts again.
  });
});
