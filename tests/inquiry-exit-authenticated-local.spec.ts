import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { Redis } from "@upstash/redis";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { loadInquiryForm, submitInquiryForm, type PublicInquiryForm } from "../custom-repo-starter/inquiry-client";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_LOCAL_PROVIDER_PROOF !== "1",
  "Requires the separately created isolated local Auth, Redis, and provider fixture.",
);
test.setTimeout(240_000);

type Snapshot = {
  revision: number | null;
  business: { id: string; name: string; role: string };
  state: {
    requests: Array<{ id: string; capabilityId: string; draft?: unknown }>;
    capabilities: Array<{ id: string; status: string; live: { version: number } | null }>;
    responsibilities: Array<{ id: string; capabilityId: string }>;
    inquiries: Array<{ id: string; fields: Record<string, string>; capabilityVersion: number; status: string }>;
  };
  capabilities: Array<{ id: string; status: string; live: { version: number } | null }>;
};

type Surface = { snapshot: Snapshot; work?: { id: string; capabilityId: string } };
type BusinessFixture = {
  tenantId: string;
  businessId: string;
  inquiryWorkspaceId: string;
  capabilityId: string;
  capabilityVersion: number;
};

function providerLogCount(): number {
  const path = process.env.STRELVA_LOCAL_PROVIDER_LOG;
  if (!path || !existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter(Boolean).length;
}

function clearReadbackFailure(): void {
  const path = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
  if (path && existsSync(path)) unlinkSync(path);
}

async function body<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  return await response.json() as T;
}

async function getSurface(request: APIRequestContext, tenantId: string): Promise<Surface> {
  const response = await request.get(`/api/inquiry-workspace?tenantId=${encodeURIComponent(tenantId)}`);
  expect(response.status(), await response.text()).toBe(200);
  return body<Surface>(response);
}

async function postSurface(
  request: APIRequestContext,
  app: string,
  tenantId: string,
  revision: number | null,
  action: Record<string, unknown>,
): Promise<Surface> {
  const response = await request.post("/api/inquiry-workspace", {
    data: { tenantId, expectedRevision: revision, action },
    headers: { origin: app, "sec-fetch-site": "same-origin" },
  });
  expect(response.status(), `inquiry action ${String(action.kind)} should succeed: ${await response.text()}`).toBe(200);
  return body<Surface>(response);
}

function fieldsFor(form: PublicInquiryForm, suffix: string): Record<string, string> {
  return Object.fromEntries(form.form.fields.map((field) => [
    field.id,
    field.kind === "email"
      ? `buyer-${suffix}@example.test`
      : field.kind === "phone"
        ? "(555) 555-0144"
        : field.kind === "select"
          ? field.options?.[0] || "First option"
          : field.id === "name"
            ? `Avery Buyer ${suffix}`
            : field.kind === "textarea"
              ? "Please call me about the listing."
              : "Avery",
  ]));
}

async function createFixture(
  admin: Pick<SupabaseClient, "from">,
  owner: { userId: string; email: string },
  ownerContext: BrowserContext,
  env: { app: string },
  label: string,
): Promise<BusinessFixture> {
  const tenantId = `inquiry-exit-${label}-${randomUUID().replaceAll("-", "").slice(0, 14)}`;
  const businessId = randomUUID();
  const inquiryWorkspaceId = randomUUID();
  const tenant = await admin.from("tenants").insert({
    id: tenantId,
    stable_id: businessId,
    site_name: `Local inquiry exit ${label}`,
    owner_name: "Local Inquiry Owner",
    owner_email: owner.email,
    industry: "real-estate",
    active: true,
    template: "wellness",
    subscription_status: "active",
    site_url: `https://${label}.inquiry-exit.example.test`,
  }).select("id, stable_id").single();
  expect(tenant.error).toBeNull();
  expect(tenant.data?.stable_id).toBe(businessId);

  const workspace = await admin.from("workspaces").insert({
    id: businessId,
    kind: "customer",
    name: `Local inquiry exit ${label}`,
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
  const tenantMembership = await admin.from("memberships").insert({ user_id: owner.userId, tenant_id: tenantId, role: "owner" });
  expect(tenantMembership.error).toBeNull();
  const inquiryWorkspace = await admin.from("inquiry_workspaces").insert({
    id: inquiryWorkspaceId,
    tenant_id: tenantId,
    business_id: businessId,
    state: new InquiryEngine({ businessId }).snapshot(),
  }).select("id").single();
  expect(inquiryWorkspace.error).toBeNull();

  const offerings = await ownerContext.request.get(`/api/offerings?businessId=${encodeURIComponent(businessId)}`);
  expect(offerings.status(), await offerings.text()).toBe(200);
  const install = await ownerContext.request.post("/api/offerings", {
    headers: { origin: env.app, "sec-fetch-site": "same-origin" },
    data: {
      action: "install",
      businessId,
      definitionId: "customer_inquiry_intake",
      definitionVersion: "1.0.0",
      idempotencyKey: `inquiry-exit-install:${randomUUID()}`,
      configuration: {},
      nativeResources: [{ kind: "inquiry_workspace", id: inquiryWorkspaceId }],
      responsibility: { kind: "customer_operated", providerName: `Local Inquiry ${label}` },
      acceptedScope: ["handle_inquiries"],
      surfaceIds: ["inquiry_workspace"],
    },
  });
  expect(install.status(), await install.text()).toBe(200);

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) await new Redis({ url: redisUrl, token: redisToken }).del("reb:tenants:all");
  let current = await getSurface(ownerContext.request, tenantId);
  const started = await postSurface(ownerContext.request, env.app, tenantId, current.snapshot.revision, {
    kind: "start",
    input: {
      intent: `Collect ${label} inquiries and route them to the owner, with a follow-up if nobody replies.`,
      title: `${label} inquiry`,
      followUpAfterMinutes: 1,
    },
  });
  current = started;
  const requestId = started.work?.id;
  expect(requestId).toBeTruthy();
  current = await postSurface(ownerContext.request, env.app, tenantId, current.snapshot.revision, {
    kind: "accept-shape",
    requestId,
    input: { selectedLineIds: ["form", "record", "routing", "follow_up"] },
  });
  const work = current.snapshot.state.requests.find((item) => item.id === requestId);
  expect(work?.draft).toBeTruthy();
  current = await postSurface(ownerContext.request, env.app, tenantId, current.snapshot.revision, {
    kind: "set-email-consent",
    requestId,
    granted: true,
  });
  const responsibility = current.snapshot.state.responsibilities.find((item) => item.capabilityId === work?.capabilityId);
  expect(responsibility).toBeTruthy();
  current = await postSurface(ownerContext.request, env.app, tenantId, current.snapshot.revision, {
    kind: "update-responsibility",
    responsibilityId: responsibility!.id,
    input: {
      hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
      preAuthorizedActions: ["reply", "send_message", "schedule_follow_up"],
      approval: [],
      budget: { dailyMessages: 20, timezone: "UTC" },
    },
  });
  current = await postSurface(ownerContext.request, env.app, tenantId, current.snapshot.revision, {
    kind: "rehearse",
    requestId,
  });
  expect(current).toBeTruthy();
  current = await postSurface(ownerContext.request, env.app, tenantId, current.snapshot.revision, { kind: "publish", requestId });
  const capability = current.snapshot.capabilities.find((item) => item.id === work?.capabilityId);
  expect(capability?.status).toMatch(/^live/);
  expect(capability?.live?.version).toBeGreaterThan(0);
  return {
    tenantId,
    businessId,
    inquiryWorkspaceId,
    capabilityId: work!.capabilityId,
    capabilityVersion: capability!.live!.version,
  };
}

async function submit(
  env: { app: string },
  fixture: BusinessFixture,
  suffix: string,
): Promise<{ form: PublicInquiryForm; fields: Record<string, string> }> {
  const form = await loadInquiryForm(env.app, fixture.tenantId, fixture.capabilityId);
  expect(form.version).toBe(fixture.capabilityVersion);
  const fields = fieldsFor(form, suffix);
  await submitInquiryForm(env.app, fixture.tenantId, form, fields);
  return { form, fields };
}

async function recordByEmail(request: APIRequestContext, tenantId: string, email: string): Promise<{ id: string; fields: Record<string, string> }> {
  const surface = await getSurface(request, tenantId);
  const record = surface.snapshot.state.inquiries.find((item) => item.fields.email === email);
  expect(record, `record for ${email}`).toBeTruthy();
  return record!;
}

test("real Auth blocks future inquiry work after exit while retaining delivery recovery and another tenant", async ({ browser }) => {
  clearReadbackFailure();
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "inquiry-exit-owner");
  const appUrl = new URL(env.app);
  appUrl.hostname = "localhost";
  const app = appUrl.origin;
  const proofEnv = { ...env, app };
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
  const providerBefore = providerLogCount();
  let exited: BusinessFixture | undefined;
  let unrelated: BusinessFixture | undefined;
  const tenants: string[] = [];
  try {
    exited = await createFixture(admin, owner, owner.context, proofEnv, "stopped");
    tenants.push(exited.tenantId);
    unrelated = await createFixture(admin, owner, owner.context, proofEnv, "open");
    tenants.push(unrelated.tenantId);
    await redis.del("reb:tenants:all");

    const first = await submit(proofEnv, exited, "first");
    const firstRecord = await recordByEmail(owner.context.request, exited.tenantId, first.fields.email!);
    const firstReviewResponse = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "prepare", tenantId: exited.tenantId, inquiryId: firstRecord.id, action: "reply" },
    });
    expect(firstReviewResponse.status(), await firstReviewResponse.text()).toBe(200);
    const firstReview = (await firstReviewResponse.json()).review as { reviewToken: string; messageDigest: string };
    const firstApproval = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "approve", tenantId: exited.tenantId, inquiryId: firstRecord.id, action: "reply", ...firstReview },
    });
    expect(firstApproval.status(), await firstApproval.text()).toBe(200);
    expect((await firstApproval.json()).outcome.status).toMatch(/^(verified|delivered)$/);

    const accepted = await submit(proofEnv, exited, "accepted");
    const acceptedRecord = await recordByEmail(owner.context.request, exited.tenantId, accepted.fields.email!);
    const acceptedReviewResponse = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "prepare", tenantId: exited.tenantId, inquiryId: acceptedRecord.id, action: "reply" },
    });
    expect(acceptedReviewResponse.status(), await acceptedReviewResponse.text()).toBe(200);
    const acceptedReview = (await acceptedReviewResponse.json()).review as { reviewToken: string; messageDigest: string };
    const readbackFailurePath = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
    expect(readbackFailurePath).toBeTruthy();
    writeFileSync(readbackFailurePath!, "fail one readback\n", { mode: 0o600 });
    const acceptedApproval = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "approve", tenantId: exited.tenantId, inquiryId: acceptedRecord.id, action: "reply", ...acceptedReview },
    });
    expect(acceptedApproval.status(), await acceptedApproval.text()).toBe(200);
    expect((await acceptedApproval.json()).outcome).toMatchObject({ status: "accepted_unverified", retryable: false });
    const acceptedProviderCount = providerLogCount();

    const unknown = await submit(proofEnv, exited, "unknown");
    const unknownRecord = await recordByEmail(owner.context.request, exited.tenantId, unknown.fields.email!);
    const unknownReviewResponse = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "prepare", tenantId: exited.tenantId, inquiryId: unknownRecord.id, action: "reply" },
    });
    expect(unknownReviewResponse.status(), await unknownReviewResponse.text()).toBe(200);
    const unknownReview = (await unknownReviewResponse.json()).review as { reviewToken: string; messageDigest: string };

    const exitResponse = await owner.context.request.post("/api/workspace-exit", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: {
        workspaceId: exited.businessId,
        futureWork: "cancel",
        providerParticipation: "revoke",
        maintainedResources: { kind: "stop" },
        idempotencyKey: `inquiry-exit-proof:${randomUUID()}`,
      },
    });
    expect(exitResponse.status(), await exitResponse.text()).toBe(200);
    expect((await exitResponse.json()).state).toMatchObject({ status: "completed", maintainedResources: { kind: "stopped" } });

    const stopForm = await owner.context.request.get(`/api/v1/inquiries/${exited.tenantId}?capabilityId=${encodeURIComponent(exited.capabilityId)}`);
    expect(stopForm.status(), await stopForm.text()).toBe(409);
    expect(await stopForm.json()).toMatchObject({ code: "workspace_exit_future_work_blocked" });
    const stopSubmit = await owner.context.request.post(`/api/v1/leads/${exited.tenantId}`, {
      headers: { "content-type": "application/json" },
      data: {
        source: "inquiry-capability",
        capabilityId: exited.capabilityId,
        capabilityVersion: exited.capabilityVersion,
        fields: first.fields,
        name: first.fields.name,
        email: first.fields.email,
        message: first.fields.message,
      },
    });
    expect(stopSubmit.status(), await stopSubmit.text()).toBe(409);
    expect(await stopSubmit.json()).toMatchObject({ code: "workspace_exit_future_work_blocked" });

    const stopConfig = await owner.context.request.post("/api/inquiry-workspace", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { tenantId: exited.tenantId, expectedRevision: 1, action: { kind: "start", input: { intent: "new work after exit" } } },
    });
    expect(stopConfig.status(), await stopConfig.text()).toBe(409);
    expect(await stopConfig.json()).toMatchObject({ code: "workspace_exit_future_work_blocked" });

    const retainedSurface = await getSurface(owner.context.request, exited.tenantId);
    expect(retainedSurface.snapshot.state.inquiries.map((item) => item.id)).toEqual(expect.arrayContaining([firstRecord.id, acceptedRecord.id, unknownRecord.id]));
    expect(retainedSurface.snapshot.state.inquiries.find((item) => item.id === acceptedRecord.id)?.fields).toEqual(accepted.fields);

    const acceptedReplay = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "approve", tenantId: exited.tenantId, inquiryId: acceptedRecord.id, action: "reply", ...acceptedReview },
    });
    expect(acceptedReplay.status(), await acceptedReplay.text()).toBe(200);
    expect((await acceptedReplay.json()).outcome).toMatchObject({ status: "accepted_unverified", retryable: false });
    expect(providerLogCount()).toBe(acceptedProviderCount);

    const unknownKey = `reb:inquiry-delivery:${encodeURIComponent(exited.tenantId)}:${encodeURIComponent(unknownRecord.id)}:reply`;
    await redis.set(unknownKey, {
      inquiryId: unknownRecord.id,
      tenantId: exited.tenantId,
      action: "reply",
      status: "unknown",
      attemptId: `unknown-${randomUUID()}`,
      attempts: 1,
      startedAt: new Date().toISOString(),
      failureReason: "local provider receipt is unknown",
      retryable: false,
    }, { ex: 86_400 });
    const unknownReplay = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      headers: { origin: proofEnv.app, "sec-fetch-site": "same-origin" },
      data: { operation: "approve", tenantId: exited.tenantId, inquiryId: unknownRecord.id, action: "reply", ...unknownReview },
    });
    expect(unknownReplay.status(), await unknownReplay.text()).toBe(503);
    expect(await unknownReplay.json()).toMatchObject({ code: "delivery_unavailable" });
    expect(await redis.get<Record<string, unknown>>(unknownKey)).toMatchObject({ status: "unknown", inquiryId: unknownRecord.id });
    expect(providerLogCount()).toBe(acceptedProviderCount);

    const unrelatedForm = await loadInquiryForm(proofEnv.app, unrelated.tenantId, unrelated.capabilityId);
    expect(unrelatedForm.version).toBe(unrelated.capabilityVersion);
    const unrelatedFields = fieldsFor(unrelatedForm, "still-open");
    const unrelatedSubmit = await submitInquiryForm(proofEnv.app, unrelated.tenantId, unrelatedForm, unrelatedFields).then(() => true, () => false);
    expect(unrelatedSubmit).toBe(true);
    const unrelatedRecord = await recordByEmail(owner.context.request, unrelated.tenantId, unrelatedFields.email!);
    expect(unrelatedRecord.fields.email).toBe(unrelatedFields.email);
  } finally {
    clearReadbackFailure();
    for (const fixture of [exited, unrelated]) {
      if (!fixture) continue;
      await Promise.resolve(admin.from("offering_installations").delete().eq("business_workspace_id", fixture.businessId));
      await Promise.resolve(admin.from("inquiry_workspaces").delete().eq("id", fixture.inquiryWorkspaceId));
      await Promise.resolve(admin.from("workspace_memberships").delete().eq("workspace_id", fixture.businessId));
      await Promise.resolve(admin.from("workspaces").delete().eq("id", fixture.businessId));
    }
    for (const tenantId of tenants) await Promise.resolve(admin.from("memberships").delete().eq("tenant_id", tenantId));
    for (const tenantId of tenants) await Promise.resolve(admin.from("tenants").delete().eq("id", tenantId));
    await redis.del("reb:tenants:all").catch(() => {});
    await owner.context.close().catch(() => {});
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
  }
});
