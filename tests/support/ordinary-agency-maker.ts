import { randomUUID } from "node:crypto";
import { expect, type Browser } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localEnvironment, type signedInContext } from "./local-auth";
import { neutralSignUp } from "./neutral-agency";
export type CustomerPerson = Awaited<ReturnType<typeof signedInContext>>;

export async function ordinaryCustomerBusiness(owner: CustomerPerson, name: string): Promise<string> {
  const response = await owner.context.request.post("/api/workspace/businesses", { headers: { origin: localEnvironment().app },
    data: { destination: { kind: "new", name }, initialRequest: null, idempotencyKey: randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).workspaceId as string;
}
/** Genuine separate agency creator. No customer role overlay, super-admin or
 * raw SQL seats. OFF Team HTTP stays unavailable; actual private owner/team
 * commands prepare its native authority, not an OFF onboarding-UI claim. */
export async function ordinaryAgencyMaker(browser: Browser, admin: SupabaseClient, owner: CustomerPerson, workspaceId: string, existingMaker?: CustomerPerson) {
  const before = await admin.rpc("workspace_make_systems_authority", { p_workspace_id: workspaceId, p_user_id: owner.userId });
  expect(before.error).toBeNull();
  expect(before.data).toBe("member");
  const maker = existingMaker ?? await neutralSignUp(browser, "native-agency-maker");
  try {
    const created = await maker.context.request.post("/api/workspace", { headers: { origin: localEnvironment().app },
      data: { action: "create_agency", name: "Ordinary native-tool agency" } });
    expect(created.status(), await created.text()).toBe(201);
    const agencyId = (await created.json()).workspaceId as string;
    const selected = await admin.rpc("choose_business_provider", { p_user_id: owner.userId, p_verified_email: owner.email,
      p_workspace_id: workspaceId, p_agency_workspace_id: agencyId });
    expect(selected.error).toBeNull();
    if (process.env.STRELVA_SYSTEMS_RELEASE !== "1") {
      const offTeam = await maker.context.request.post("/api/workspace/agency-team", { headers: { origin: localEnvironment().app },
        data: { action: "assign", workspaceId: agencyId, userIds: [maker.userId], clientIds: [workspaceId], active: true } });
      expect(offTeam.status()).toBe(503);
    }
    const staffed = await admin.rpc("bulk_set_agency_client_staff", { p_user_id: maker.userId, p_verified_email: maker.email,
      p_agency_workspace_id: agencyId, p_staff_user_ids: [maker.userId], p_workspace_ids: [workspaceId], p_active: true });
    expect(staffed.error).toBeNull();
    const authority = await admin.rpc("workspace_make_systems_authority", { p_workspace_id: workspaceId, p_user_id: maker.userId });
    expect(authority.error).toBeNull();
    expect(authority.data).toBe("provider");
    const customer = await admin.rpc("workspace_make_systems_authority", { p_workspace_id: workspaceId, p_user_id: owner.userId });
    expect(customer.error).toBeNull();
    expect(customer.data).toBe("member");
    return { ...maker, agencyId };
  } catch (error) {
    await maker.context.close();
    throw error;
  }
}
