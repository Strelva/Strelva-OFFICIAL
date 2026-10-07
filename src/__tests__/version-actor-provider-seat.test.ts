import { describe, expect, it, vi } from "vitest";
import { readVersionActor } from "@/platform/system-versions/supabase-store";
import { WorkspaceStoreError } from "@/platform/workspaces/types";

const USER = "11111111-1111-4111-8111-111111111111";
const AGENCY = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

// read_version_actor lists provider seats beside direct memberships
// (20261009151000_provider_seats.sql); the Versions actor carries both.
describe("readVersionActor with provider seats", () => {
  it("keeps the seat as a membership with its role and says how it was reached", async () => {
    const rpc = vi.fn(async () => ({ data: { userId: USER, memberships: [
      { businessId: AGENCY, role: "member", via: "membership" },
      { businessId: CLIENT, role: "admin", via: "provider_seat" },
    ] }, error: null }));
    const actor = await readVersionActor({ userId: USER, verifiedEmail: "Staff@Agency.example" }, { rpc });
    expect(rpc).toHaveBeenCalledWith("read_version_actor", { p_user_id: USER, p_verified_email: "staff@agency.example" });
    expect(actor.memberships).toEqual([
      { businessId: AGENCY, role: "member", via: "membership" },
      { businessId: CLIENT, role: "admin", via: "provider_seat" },
    ]);
  });

  it("still reads the pre-7A shape and refuses an unknown route", async () => {
    const legacy = vi.fn(async () => ({ data: { userId: USER, memberships: [{ businessId: CLIENT, role: "owner" }] }, error: null }));
    await expect(readVersionActor({ userId: USER, verifiedEmail: "owner@client.example" }, { rpc: legacy }))
      .resolves.toMatchObject({ memberships: [{ businessId: CLIENT, role: "owner" }] });
    const unknown = vi.fn(async () => ({ data: { userId: USER, memberships: [{ businessId: CLIENT, role: "admin", via: "super_admin" }] }, error: null }));
    await expect(readVersionActor({ userId: USER, verifiedEmail: "owner@client.example" }, { rpc: unknown }))
      .rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
