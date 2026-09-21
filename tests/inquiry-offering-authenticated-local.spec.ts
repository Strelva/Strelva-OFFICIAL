import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth and Postgres.");
test.setTimeout(120_000);

test("a business owner connects an existing inquiry workspace through the local offering", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "inquiry-offering-owner");
  const businessId = randomUUID();
  const tenantId = `inquiry-offering-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const inquiryWorkspaceId = randomUUID();

  try {
    const tenant = await admin.from("tenants").insert({
      id: tenantId,
      stable_id: businessId,
      site_name: "Local Inquiry Business",
      owner_name: "Local Inquiry Owner",
      owner_email: owner.email,
      industry: "real-estate",
      active: true,
      template: "wellness",
      subscription_status: "active",
      site_url: "https://local-inquiry-offering.example.test",
    }).select("id, stable_id").single();
    expect(tenant.error).toBeNull();
    expect(tenant.data?.stable_id).toBe(businessId);

    const workspace = await admin.from("workspaces").insert({
      id: businessId,
      kind: "customer",
      name: "Local Inquiry Business",
      created_by: owner.userId,
    });
    expect(workspace.error).toBeNull();
    const workspaceMembership = await admin.from("workspace_memberships").insert({
      workspace_id: businessId,
      user_id: owner.userId,
      role: "owner",
      created_by: owner.userId,
    });
    expect(workspaceMembership.error).toBeNull();
    const tenantMembership = await admin.from("memberships").insert({
      user_id: owner.userId,
      tenant_id: tenantId,
      role: "owner",
    });
    expect(tenantMembership.error).toBeNull();

    const inquiryWorkspace = await admin.from("inquiry_workspaces").insert({
      id: inquiryWorkspaceId,
      tenant_id: tenantId,
      business_id: businessId,
      state: new InquiryEngine({ businessId }).snapshot(),
    }).select("id, tenant_id, tenant_stable_id, business_id").single();
    expect(inquiryWorkspace.error).toBeNull();
    expect(inquiryWorkspace.data).toMatchObject({
      id: inquiryWorkspaceId,
      tenant_id: tenantId,
      tenant_stable_id: businessId,
      business_id: businessId,
    });

    const offerings = await owner.context.request.get(`/api/offerings?businessId=${encodeURIComponent(businessId)}`);
    expect(offerings.status(), await offerings.text()).toBe(200);
    const collection = await offerings.json() as {
      definitions: Array<{ id: string; installability: string; availability: string }>;
      installations: Array<{ definitionId: string }>;
    };
    expect(collection.definitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "customer_inquiry_intake", installability: "available", availability: "release_gated" }),
    ]));

    const install = await owner.context.request.post("/api/offerings", {
      headers: { origin: env.app },
      data: {
        action: "install",
        businessId,
        definitionId: "customer_inquiry_intake",
        definitionVersion: "1.0.0",
        idempotencyKey: `inquiry-offering:${randomUUID()}`,
        configuration: {},
        nativeResources: [{ kind: "inquiry_workspace", id: inquiryWorkspaceId }],
        responsibility: { kind: "customer_operated", providerName: "Local Inquiry Business" },
        acceptedScope: ["handle_inquiries"],
        surfaceIds: ["inquiry_workspace"],
      },
    });
    expect(install.status(), await install.text()).toBe(200);
    const installed = await install.json() as { installation?: { status: string; surfaces: Array<{ id: string; href: string | null }> } };
    expect(installed.installation).toMatchObject({
      status: "active",
      surfaces: [{ id: "inquiry_workspace", href: `/workspace?workspaceId=${businessId}&view=inquiries&inquiryWorkspaceId=${inquiryWorkspaceId}` }],
    });

    const inquiry = await owner.context.request.get(`/api/inquiry-workspace?tenantId=${encodeURIComponent(tenantId)}`);
    const inquiryPayload = await inquiry.json().catch(() => ({}));
    expect(inquiry.status(), JSON.stringify(inquiryPayload)).toBe(200);
    expect(inquiryPayload).toMatchObject({ snapshot: { business: { tenantId, id: businessId } } });
  } finally {
    await owner.context.close().catch(() => {});
    await admin.from("tenants").delete().eq("id", tenantId);
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
  }
});
