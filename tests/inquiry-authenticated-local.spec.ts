import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Redis } from "@upstash/redis";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_LOCAL_PROVIDER_PROOF !== "1",
  "Requires the separately created isolated local Auth, Redis, and provider fixture.",
);
test.setTimeout(180_000);

type SurfaceSnapshot = {
  revision: number | null;
  business: { id: string; name: string; role: string };
  state: {
    requests: Array<{ id: string; capabilityId: string; state: string; draft?: { version: number; form: { title: string }; connections: Array<{ id: string; status: string; consent: string }> } | null }>;
    capabilities: Array<{ id: string; status: string; live: { version: number } | null }>;
    changes: Array<{ requestId: string; status: string; undoAvailable: boolean }>;
    actionReceipts: Array<{ action: string; inquiryId: string | null }>;
    responsibilities: Array<{ id: string; capabilityId: string }>;
    inquiries: Array<{ id: string; fields: Record<string, string>; capabilityVersion: number; status: string }>;
    timeline: Array<{ inquiryId: string; type: string; summary: string }>;
  };
  capabilities: Array<{ id: string; status: string; live: { version: number } | null }>;
  available: boolean;
  readOnly: boolean;
};

type SurfaceBody = {
  snapshot: SurfaceSnapshot;
  work?: SurfaceSnapshot["state"]["requests"][number];
  rehearsal?: { passed: boolean; passedCount: number; totalCount: number };
  message?: string;
};

type PublishedInquiryForm = {
  capabilityId: string;
  version: number;
  form: {
    fields: Array<{ id: string; kind: string; required: boolean; options?: string[] }>;
  };
};

function providerLogCount(): number {
  const path = process.env.STRELVA_LOCAL_PROVIDER_LOG;
  if (!path || !existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter(Boolean).length;
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  return await response.json() as T;
}

async function getSurface(request: APIRequestContext, tenantId: string): Promise<SurfaceBody> {
  const response = await request.get(`/api/inquiry-workspace?tenantId=${encodeURIComponent(tenantId)}`);
  expect(response.status()).toBe(200);
  return json<SurfaceBody>(response);
}

async function postSurface(
  request: APIRequestContext,
  app: string,
  tenantId: string,
  revision: number | null,
  action: Record<string, unknown>,
): Promise<SurfaceBody> {
  const response = await request.post("/api/inquiry-workspace", {
    data: { tenantId, expectedRevision: revision, action },
    headers: { origin: app },
  });
  expect(response.status(), `inquiry action ${String(action.kind)} should succeed`).toBe(200);
  return json<SurfaceBody>(response);
}

function fieldsFor(form: PublishedInquiryForm): Record<string, string> {
  return Object.fromEntries(form.form.fields.map((field) => [
    field.id,
    field.kind === "email"
      ? "customer@example.test"
      : field.kind === "phone"
        ? "(555) 555-0144"
        : field.kind === "select"
          ? field.options?.[0] || "First option"
          : field.id === "name"
            ? "Avery Buyer"
            : field.kind === "textarea"
              ? "Please call me about the listing."
              : "Avery",
  ]));
}

async function cleanTenant(
  admin: Pick<SupabaseClient, "from" | "auth">,
  tenantId: string,
  ownerId: string,
  strangerId: string,
  leadIds: string[],
): Promise<void> {
  await admin.from("tenants").delete().eq("id", tenantId);
  await admin.auth.admin.deleteUser(ownerId);
  await admin.auth.admin.deleteUser(strangerId);

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return;
  try {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const indexed = await redis.zrange<string[]>(`leads:${tenantId}`, 0, -1);
    const ids = [...new Set([...(indexed || []), ...leadIds])];
    if (ids.length > 0) await redis.del(...ids.map((id) => `lead:${tenantId}:${id}`));
    await redis.del(`leads:${tenantId}`);
  } catch {
    // The tenant is unique to this isolated run. A Redis cleanup blip cannot
    // turn the proof into a false success or touch another tenant's keys.
  }
}

test("real local Auth and Postgres preserve an inquiry through publish and undo", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "inquiry-owner");
  const stranger = await signedInContext(browser, admin, "inquiry-stranger");
  const tenantId = `inquiry-proof-${randomUUID().slice(0, 12)}`;
  const leadIds: string[] = [];
  let page: Page | undefined;

  try {
    const tenant = await admin.from("tenants").insert({
      id: tenantId,
      site_name: "Local Inquiry Proof",
      owner_name: "Local Inquiry Owner",
      owner_email: owner.email,
      industry: "real-estate",
      active: true,
      template: "wellness",
      subscription_status: "active",
      site_url: "https://local-inquiry.example.test",
    }).select("id, stable_id").single();
    expect(tenant.error).toBeNull();
    expect(tenant.data?.stable_id).toBeTruthy();

    const membership = await admin.from("memberships").insert({ user_id: owner.userId, tenant_id: tenantId, role: "owner" });
    expect(membership.error).toBeNull();

    const deniedRead = await stranger.context.request.get(`/api/inquiry-workspace?tenantId=${encodeURIComponent(tenantId)}`);
    expect(deniedRead.status()).toBe(403);
    expect(await deniedRead.text()).not.toContain("Local Inquiry Proof");
    const deniedWrite = await stranger.context.request.post("/api/inquiry-workspace", {
      data: { tenantId, expectedRevision: null, action: { kind: "start", input: { intent: "Stranger write" } } },
      headers: { origin: env.app },
    });
    expect(deniedWrite.status()).toBe(403);

    let current = await getSurface(owner.context.request, tenantId);
    expect(current.snapshot.revision).toBeNull();
    const started = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "start",
      input: {
        intent: "Collect seller inquiries and route them to Maria, with a follow-up if nobody replies.",
        title: "Seller inquiry",
      },
    });
    current = started;
    const requestId = started.work?.id;
    expect(requestId).toBeTruthy();

    const shaped = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "accept-shape",
      requestId,
      input: { selectedLineIds: ["form", "record", "routing", "follow_up"] },
    });
    current = shaped;
    const workAfterShape = shaped.snapshot.state.requests.find((work) => work.id === requestId);
    expect(workAfterShape?.draft).toBeTruthy();
    const draftTitle = workAfterShape?.draft?.form.title;

    const edited = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "edit",
      requestId,
      input: { source: "manual", path: "form.title", after: "Local seller inquiry" },
    });
    current = edited;
    expect(edited.snapshot.state.requests.find((work) => work.id === requestId)?.draft?.form.title).toBe("Local seller inquiry");
    expect(draftTitle).not.toBe("Local seller inquiry");

    const consent = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "set-email-consent",
      requestId,
      granted: true,
    });
    current = consent;
    const consentedDraft = consent.snapshot.state.requests.find((work) => work.id === requestId)?.draft;
    expect(consentedDraft?.connections[0]).toMatchObject({ id: "email", consent: "explicit" });

    const responsibility = current.snapshot.state.responsibilities.find((item) => item.capabilityId === workAfterShape?.capabilityId);
    expect(responsibility).toBeTruthy();
    current = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "update-responsibility", responsibilityId: responsibility!.id,
      input: { hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" } },
    });

    const rehearsed = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "rehearse",
      requestId,
    });
    current = rehearsed;
    expect(rehearsed.rehearsal).toMatchObject({ passed: true, passedCount: 8, totalCount: 8 });

    const published = await postSurface(owner.context.request, env.app, tenantId, current.snapshot.revision, {
      kind: "publish",
      requestId,
    });
    current = published;
    const capability = published.snapshot.capabilities.find((item) => item.id === workAfterShape?.capabilityId);
    expect(capability?.status).toMatch(/^live/);
    expect(capability?.live?.version).toBeGreaterThan(0);
    expect(published.snapshot.state.changes.some((change) => change.requestId === requestId && change.status.startsWith("published"))).toBe(true);

    const formResponse = await owner.context.request.get(`/api/v1/inquiries/${tenantId}?capabilityId=${encodeURIComponent(capability!.id)}`);
    expect(formResponse.status()).toBe(200);
    const form = await json<PublishedInquiryForm>(formResponse);
    expect(form.capabilityId).toBe(capability!.id);
    expect(form.version).toBe(capability!.live?.version);

    const providerBefore = providerLogCount();
    const fields = fieldsFor(form);
    const intake = await owner.context.request.post(`/api/v1/leads/${tenantId}`, {
      data: {
        source: "inquiry-capability",
        capabilityId: form.capabilityId,
        capabilityVersion: form.version,
        name: fields.name,
        email: fields.email,
        message: fields.message,
        fields,
      },
    });
    expect(intake.status()).toBe(200);
    // Capability captures are supervised. They record the inquiry and leave
    // customer messaging to the governed delivery worker, so a capture must
    // not create an owner notification behind the review boundary.
    expect(providerLogCount()).toBe(providerBefore);

    const afterIntake = await getSurface(owner.context.request, tenantId);
    const record = afterIntake.snapshot.state.inquiries.find((item) => item.fields.email === fields.email);
    expect(record).toBeTruthy();
    leadIds.push(record!.id);
    expect(afterIntake.snapshot.state.actionReceipts.some((receipt) => receipt.action === "record_inquiry" && receipt.inquiryId === record!.id)).toBe(true);
    expect(afterIntake.snapshot.state.timeline.some((event) => event.inquiryId === record!.id && event.type === "record_created")).toBe(true);

    const recordPage = await owner.context.newPage();
    page = recordPage;
    await recordPage.setViewportSize({ width: 1280, height: 800 });
    await recordPage.goto(`/business/${tenantId}?view=receipt&request=${encodeURIComponent(requestId!)}`, { waitUntil: "domcontentloaded" });
    await expect(recordPage.getByRole("heading", { name: "A record of what changed.", exact: true })).toBeVisible();
    await expect(recordPage.getByText("Receipt", { exact: true }).first()).toBeVisible();

    await recordPage.goto(`/business/${tenantId}?view=record&inquiry=${encodeURIComponent(record!.id)}`, { waitUntil: "domcontentloaded" });
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await expect(recordPage.getByRole("heading", { name: "The submitted input", exact: true })).toBeVisible();
    await expect(recordPage.getByRole("region", { name: "Facts and outcomes" }).getByText("The customer submitted the inquiry form.", { exact: true })).toBeVisible();
    await expect(recordPage.getByRole("region", { name: "Messages for this inquiry" })).toBeVisible();
    await expect(recordPage.getByRole("button", { name: "Review current message", exact: true })).toBeVisible();
    const preparedResponse = recordPage.waitForResponse((response) => response.url().endsWith("/api/inquiry-workspace/message-review") && response.request().postDataJSON().operation === "prepare");
    await recordPage.getByRole("button", { name: "Review current message", exact: true }).click();
    const prepared = await preparedResponse;
    expect(prepared.status(), await prepared.text()).toBe(200);
    const review = (await prepared.json()).review;
    await expect(recordPage.locator("[data-message-review]")).toContainText(fields.email!);
    expect(providerLogCount()).toBe(providerBefore);
    const approvedResponse = recordPage.waitForResponse((response) => response.url().endsWith("/api/inquiry-workspace/message-review") && response.request().postDataJSON().operation === "approve");
    await recordPage.getByRole("button", { name: "Send this message", exact: true }).click();
    const approved = await approvedResponse;
    expect(approved.status(), await approved.text()).toBe(200);
    expect((await approved.json()).outcome.status).toMatch(/^(verified|delivered)$/);
    await expect(recordPage.getByRole("button", { name: "Send this message", exact: true })).toHaveCount(0);
    expect(providerLogCount()).toBe(providerBefore + 1);
    await recordPage.screenshot({ path: "output/inquiry-approved-message-desktop.png", fullPage: true });
    const duplicate = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      data: { operation: "approve", tenantId, inquiryId: record!.id, action: "reply", reviewToken: review.reviewToken, messageDigest: review.messageDigest },
      headers: { origin: env.app },
    });
    expect(duplicate.status(), await duplicate.text()).toBe(200);
    expect((await duplicate.json()).outcome.retryable).toBe(false);
    expect(providerLogCount()).toBe(providerBefore + 1);
    await recordPage.reload();
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await recordPage.getByRole("button", { name: "Ask Why from recorded evidence", exact: true }).click();
    await expect(recordPage.getByRole("heading", { name: "Recorded steps", exact: true })).toBeVisible();
    await expect(recordPage.getByRole("region", { name: "Recorded steps" }).getByText("The customer submitted the inquiry form.", { exact: true })).toBeVisible();

    await recordPage.setViewportSize({ width: 390, height: 844 });
    await expect(recordPage.getByRole("main")).toBeVisible();
    await expect.poll(async () => (await recordPage.getByRole("main").boundingBox())?.width ?? 0).toBeGreaterThan(350);
    await recordPage.screenshot({ path: "output/inquiry-authenticated-local-mobile.png", fullPage: true });

    await recordPage.goto(`/workspace?view=inquiries&tenantId=${tenantId}&inquiryView=record&inquiryRecord=${encodeURIComponent(record!.id)}`);
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await expect(recordPage.getByRole("navigation", { name: "Inquiry work" })).toBeVisible();
    await recordPage.reload();
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();

    const beforeUndo = await getSurface(owner.context.request, tenantId);
    const undone = await postSurface(owner.context.request, env.app, tenantId, beforeUndo.snapshot.revision, {
      kind: "undo",
      requestId,
    });
    const visibleAfterUndo = undone.snapshot.state.inquiries.find((item) => item.id === record!.id);
    expect(visibleAfterUndo?.fields.email).toBe(fields.email);
    expect(undone.snapshot.capabilities.find((item) => item.id === capability!.id)?.live).toBeNull();
    const publicAfterUndo = await owner.context.request.get(`/api/v1/inquiries/${tenantId}?capabilityId=${encodeURIComponent(capability!.id)}`);
    expect(publicAfterUndo.status()).toBe(404);

    const reloadedAfterUndo = await getSurface(owner.context.request, tenantId);
    const preserved = reloadedAfterUndo.snapshot.state.inquiries.find((item) => item.id === record!.id);
    expect(preserved?.fields.email).toBe(fields.email);
    expect(reloadedAfterUndo.snapshot.state.actionReceipts.some((receipt) => receipt.action === "record_inquiry" && receipt.inquiryId === record!.id)).toBe(true);
    await recordPage.goto(`/business/${tenantId}?view=record&inquiry=${encodeURIComponent(record!.id)}`, { waitUntil: "domcontentloaded" });
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await recordPage.getByRole("button", { name: "Record history", exact: true }).click();
    await expect(recordPage.getByRole("dialog", { name: "Record timeline" })).toBeVisible();
    await recordPage.getByRole("button", { name: "Close Record timeline", exact: true }).click();
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await recordPage.screenshot({ path: "output/inquiry-preserved-record-mobile.png", fullPage: true });
  } finally {
    await page?.close().catch(() => {});
    await owner.context.close();
    await stranger.context.close();
    await cleanTenant(admin, tenantId, owner.userId, stranger.userId, leadIds);
  }
});
