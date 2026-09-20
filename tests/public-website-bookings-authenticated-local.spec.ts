import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { Redis } from "@upstash/redis";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1"
    || process.env.STRELVA_PUBLIC_BOOKING_JOURNEY !== "1"
    || process.env.STRELVA_CALENDAR_FIXTURE !== "1",
  "Requires isolated local Auth/Postgres and the explicit synthetic Outlook provider flag.",
);
test.setTimeout(180_000);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function revision(body: JsonObject): number | null {
  const raw = object(body.snapshot).revision;
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

async function responseJson(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<JsonObject> {
  const body: unknown = await response.json().catch(() => null);
  return object(body);
}

async function inquiryAction(
  request: APIRequestContext,
  app: string,
  tenantId: string,
  expectedRevision: number | null,
  action: JsonObject,
): Promise<JsonObject> {
  const response = await request.post("/api/inquiry-workspace", {
    headers: { origin: app },
    data: { tenantId, expectedRevision, action },
  });
  const body = await responseJson(response);
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function postJson(request: APIRequestContext, app: string, path: string, data: JsonObject, expectedStatus = 200): Promise<JsonObject> {
  const endpoint = new URL(path, app);
  const response = await request.post(endpoint.toString(), { headers: { origin: endpoint.origin }, data });
  const body = await responseJson(response);
  expect(response.status(), JSON.stringify(body)).toBe(expectedStatus);
  return body;
}

async function serveGeneratedSite(root: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const target = normalize(join(root, relative));
    if (!target.startsWith(root)) {
      response.writeHead(404);
      response.end();
      return;
    }
    try {
      const content = readFileSync(target);
      const contentType = target.endsWith(".js") || target.endsWith(".mjs") ? "text/javascript" : target.endsWith(".json") ? "application/json" : "text/html";
      response.writeHead(200, { "Content-Type": contentType });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The generated site fixture did not bind a port.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function buildGeneratedSite(input: { context: BrowserContext; app: string; businessId: string; tenantId: string; inquiryCapabilityId: string; bookingGrantId: string }): Promise<{ root: string; dist: string }> {
  const created = await postJson(input.context.request, input.app, "/api/websites", {
    action: "create", workspaceId: input.businessId, requestId: randomUUID(),
    brief: { businessName: "Generated booking proof", description: "Consultations by appointment", primaryCallToAction: "Choose a time" },
  }, 201);
  const websiteWorkId = text(created.workId);
  expect(websiteWorkId).not.toBe("");
  const editor = await input.context.newPage();
  let connected: JsonObject;
  try {
    await editor.goto(`/workspace?workspaceId=${input.businessId}&view=websites&work=${websiteWorkId}`);
    await editor.getByRole("button", { name: "Choose forms", exact: true }).click();
    await editor.getByLabel("Connected website", { exact: true }).selectOption(input.tenantId);
    await editor.getByLabel("Inquiry form", { exact: true }).selectOption(input.inquiryCapabilityId);
    await editor.getByLabel("Booking calendar", { exact: true }).selectOption(input.bookingGrantId);
    const responsePromise = editor.waitForResponse(response => new URL(response.url()).pathname === `/api/websites/${websiteWorkId}/connections` && response.request().method() === "POST");
    await editor.getByRole("button", { name: "Update website preview", exact: true }).click();
    const response = await responsePromise;
    connected = object(await response.json());
    expect(response.status(), JSON.stringify(connected)).toBe(200);
    await expect(editor.getByText("Inquiry form selected. Booking calendar selected.", { exact: true })).toBeVisible();
    await editor.screenshot({ path: "/tmp/strelva-connected-website-desktop.png", fullPage: true });
    await editor.setViewportSize({ width: 390, height: 900 });
    await expect.poll(() => editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await editor.screenshot({ path: "/tmp/strelva-connected-website-mobile.png", fullPage: true });
  } finally { await editor.close(); }
  const website = object(connected.website);
  expect(object(website.publishedCapabilitySelection)).toEqual({ tenantId: input.tenantId, inquiryCapabilityId: input.inquiryCapabilityId, bookingGrantId: input.bookingGrantId });
  expect(website.approvedCandidateRevision).toBeNull();
  const candidate = object(website.candidate);
  const href = `/api/websites/${websiteWorkId}/export?revision=${candidate.revision}&contentHash=${candidate.contentHash}`;
  const response = await input.context.request.get(href);
  expect(response.status()).toBe(200);
  const root = mkdtempSync(join(tmpdir(), "strelva-public-booking-site-"));
  const archive = join(root, "website.tar");
  writeFileSync(archive, await response.body());
  execFileSync("tar", ["-xf", archive, "-C", root], { stdio: "pipe" });
  execFileSync(process.execPath, [join(root, "scripts/build-site.mjs")], { cwd: root, stdio: "pipe" });
  return { root, dist: join(root, "dist") };
}

async function closeContext(context: BrowserContext | undefined): Promise<void> {
  await context?.close().catch(() => {});
}

test("a generated client carries a visitor inquiry and native Outlook booking to the owner", async ({ browser }) => {
  const env = localEnvironment();
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(redisUrl).hostname)) throw new Error("This proof requires a loopback Redis REST fixture for the governed change queue.");
  const redis = new Redis({ url: redisUrl, token: process.env.UPSTASH_REDIS_REST_TOKEN || "" });
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "public-booking");
  const businessId = randomUUID();
  const tenantId = `public-booking-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const tenantStableId = randomUUID();
  const inquiryWorkspaceId = randomUUID();
  let bindingId = "";
  let siteRoot = "";
  let siteServer: { close: () => Promise<void> } | undefined;
  try {
    const workspace = await admin.from("workspaces").insert({ id: businessId, kind: "customer", name: "Generated booking proof", created_by: owner.userId });
    expect(workspace.error).toBeNull();
    const workspaceMember = await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: owner.userId });
    expect(workspaceMember.error).toBeNull();
    const tenant = await admin.from("tenants").insert({
      id: tenantId,
      stable_id: tenantStableId,
      site_name: "Generated booking proof site",
      owner_name: "Generated booking owner",
      owner_email: owner.email,
      active: true,
      subscription_status: "active",
      template: "wellness",
      site_url: "https://generated-booking.example.test",
    });
    expect(tenant.error).toBeNull();
    // Direct fixture insertion bypasses native tenant cache invalidation.
    await redis.del("reb:tenants:all");
    const tenantMember = await admin.from("memberships").insert({ user_id: owner.userId, tenant_id: tenantId, role: "owner", tenant_stable_id: tenantStableId });
    expect(tenantMember.error).toBeNull();

    const inquiryWorkspace = await admin.from("inquiry_workspaces").insert({
      id: inquiryWorkspaceId,
      tenant_id: tenantId,
      business_id: businessId,
      state: new InquiryEngine({ businessId }).snapshot(),
    });
    expect(inquiryWorkspace.error).toBeNull();

    const inquiryOffering = await postJson(owner.context.request, env.app, "/api/offerings", {
      action: "install",
      businessId,
      definitionId: "customer_inquiry_intake",
      definitionVersion: "1.0.0",
      idempotencyKey: `public-booking-inquiry:${randomUUID()}`,
      configuration: {},
      nativeResources: [{ kind: "inquiry_workspace", id: inquiryWorkspaceId }],
      responsibility: { kind: "customer_operated", providerName: "Generated booking proof" },
      acceptedScope: ["handle_inquiries"],
      surfaceIds: ["inquiry_workspace"],
    });
    expect(object(inquiryOffering.installation).status).toBe("active");

    const binding = await postJson(owner.context.request, env.app, "/api/offerings/websites", {
      action: "bind_managed_website",
      businessId,
      tenantId,
      idempotencyKey: `public-booking-binding-${randomUUID()}`,
    });
    bindingId = text(object(binding.websiteBinding).id);
    expect(bindingId).toMatch(/^[0-9a-f-]{36}$/);

    const schedule = await postJson(owner.context.request, env.app, "/api/bounded-work", {
      action: "create",
      productId: "scheduling",
      workspaceId: businessId,
      input: {
        title: "Consultations",
        availability: [
          { start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" },
          { start: "2026-10-02T13:00:00Z", end: "2026-10-02T14:00:00Z" },
        ],
      },
    }, 201);
    const workId = text(schedule.id);
    expect(workId).toMatch(/^[0-9a-f-]{36}$/);
    const schedulePayload = object(schedule.payload);
    const scheduleVersion = Number(schedulePayload.version);
    expect(Number.isSafeInteger(scheduleVersion)).toBe(true);

    const connection = await admin.from("workspace_calendar_connections").upsert({
      workspace_id: businessId,
      provider: "outlook",
      calendar_id: "fixture-calendar",
      calendar_name: "Synthetic Outlook",
      time_zone: "America/New_York",
      status: "connected",
      scopes: ["Calendars.ReadWrite"],
      access_token_ciphertext: "synthetic-access",
      reminder_policy: { mode: "provider_default" },
      created_by: owner.userId,
    }, { onConflict: "workspace_id,provider" });
    expect(connection.error).toBeNull();

    const inquiryRead = await owner.context.request.get(`/api/inquiry-workspace?tenantId=${encodeURIComponent(tenantId)}`);
    let inquiry = await responseJson(inquiryRead);
    expect(inquiryRead.status(), JSON.stringify(inquiry)).toBe(200);
    inquiry = await inquiryAction(owner.context.request, env.app, tenantId, revision(inquiry), {
      kind: "start",
      input: { intent: "Collect consultation requests and route them to the owner.", title: "Consultation inquiry", followUpAfterMinutes: 1 },
    });
    const requestId = text(object(inquiry.work).id);
    expect(requestId.length).toBeGreaterThan(0);
    inquiry = await inquiryAction(owner.context.request, env.app, tenantId, revision(inquiry), {
      kind: "accept-shape",
      requestId,
      input: { selectedLineIds: ["form", "record", "routing", "follow_up"] },
    });
    const shapedRequest = array(object(object(inquiry.snapshot).state).requests)
      .map(object)
      .find((item) => text(item.id) === requestId);
    const inquiryCapabilityId = text(shapedRequest?.capabilityId);
    expect(inquiryCapabilityId).toMatch(/^[a-z][a-z0-9_-]{0,79}$/);
    inquiry = await inquiryAction(owner.context.request, env.app, tenantId, revision(inquiry), { kind: "set-email-consent", requestId, granted: true });
    const responsibility = array(object(object(inquiry.snapshot).state).responsibilities)
      .map(object)
      .find((item) => text(item.capabilityId) === inquiryCapabilityId);
    expect(text(responsibility?.id)).toMatch(/^responsibility_[a-z0-9_]+$/);
    inquiry = await inquiryAction(owner.context.request, env.app, tenantId, revision(inquiry), {
      kind: "update-responsibility",
      responsibilityId: text(responsibility?.id),
      input: {
        hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
        preAuthorizedActions: ["reply", "send_message", "schedule_follow_up"],
        approval: [],
        budget: { dailyMessages: 20, timezone: "UTC" },
      },
    });
    inquiry = await inquiryAction(owner.context.request, env.app, tenantId, revision(inquiry), { kind: "rehearse", requestId });
    expect(object(inquiry.rehearsal).passed).toBe(true);
    inquiry = await inquiryAction(owner.context.request, env.app, tenantId, revision(inquiry), { kind: "publish", requestId });
    const publishedCapability = array(object(inquiry.snapshot).capabilities)
      .map(object)
      .find((item) => text(item.id) === inquiryCapabilityId);
    const inquiryVersion = Number(object(publishedCapability?.live).version);
    expect(inquiryVersion).toBeGreaterThan(0);

    const grant = await postJson(owner.context.request, env.app, "/api/workspace/public-bookings", {
      action: "publish",
      businessId,
      tenantId,
      workId,
      capabilityId: "consultations",
      capabilityVersion: scheduleVersion,
      inquiryCapabilityId,
      inquiryVersion,
      provider: "outlook",
      displayName: "Consultations",
      timeZone: "America/New_York",
    }, 201);
    expect(text(object(grant.grant).status)).toBe("published");

    const availabilityQuery = new URLSearchParams({ workspaceId: businessId, provider: "outlook", start: "2026-10-01T13:00:00Z", end: "2026-10-02T14:00:00Z" });
    const providerAvailability = await owner.context.request.get(`/api/workspace/calendar-availability?${availabilityQuery}`);
    expect(providerAvailability.status(), await providerAvailability.text()).toBe(200);
    const generated = await buildGeneratedSite({
      context: owner.context, app: env.app, businessId, tenantId,
      inquiryCapabilityId, bookingGrantId: text(object(grant.grant).id),
    });
    siteRoot = generated.root;
    const served = await serveGeneratedSite(generated.dist);
    siteServer = served;

    const page = await owner.context.newPage();
    await page.goto(served.baseUrl, { waitUntil: "domcontentloaded" });
    const inquiryRoot = page.locator('[data-strelva-capability="inquiry"]');
    await expect(inquiryRoot.getByRole("heading", { name: /consultation inquiry/i })).toBeVisible();
    await inquiryRoot.getByLabel("Name").fill("Inquiry Visitor");
    await inquiryRoot.getByLabel("Email").fill("inquiry-visitor@example.test");
    await inquiryRoot.getByLabel("Message").fill("Please arrange a consultation.");
    await inquiryRoot.getByRole("button", { name: "Send request" }).click();
    await expect(inquiryRoot.getByText("Your request has been received.")).toBeVisible();

    const bookingRoot = page.locator('[data-strelva-capability="booking"]');
    await expect(bookingRoot.getByRole("heading", { name: "Consultations" })).toBeVisible();
    await bookingRoot.getByLabel("Name").fill("Booking Visitor");
    await bookingRoot.getByLabel("Email").fill("booking-visitor@example.test");
    await bookingRoot.getByRole("button", { name: "Reserve time" }).click();
    await expect(bookingRoot.getByText("Your time is reserved.")).toBeVisible();
    await page.screenshot({ path: "/tmp/strelva-native-booking-confirmed-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/strelva-native-booking-confirmed-mobile.png", fullPage: true });
    await bookingRoot.locator("#strelva-booking-slot").selectOption({ index: 1 });
    const changedResponse = page.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes("/reservations/"));
    await bookingRoot.getByRole("button", { name: "Change time" }).click();
    const changed = await changedResponse;
    expect(changed.status(), await changed.text()).toBe(200);
    await expect(bookingRoot.getByText("Outlook confirmed this reservation.")).toBeVisible();
    await bookingRoot.getByRole("button", { name: "Cancel reservation" }).click();
    await expect(bookingRoot.getByText("This reservation is cancelled.")).toBeVisible();

    const ownerInquiry = await responseJson(await owner.context.request.get(`/api/inquiry-workspace?tenantId=${encodeURIComponent(tenantId)}`));
    const inquiries = array(object(object(ownerInquiry.snapshot).state).inquiries).map(object);
    expect(inquiries.some((item) => text(object(item.fields).email) === "inquiry-visitor@example.test")).toBe(true);
    expect(inquiries.some((item) => text(object(item.fields).email) === "booking-visitor@example.test")).toBe(true);

    const scheduleRead = await responseJson(await owner.context.request.get(`/api/bounded-work?productId=scheduling&workId=${encodeURIComponent(workId)}`));
    const reservations = array(object(scheduleRead.payload).reservations).map(object);
    expect(reservations.some((item) => item.status === "cancelled" && text(item.providerId).startsWith("fixture-"))).toBe(true);
    const receipts = await admin.from("public_website_bookings").select("status,management_token_ciphertext,calendar_request_id,provider").eq("business_workspace_id", businessId);
    expect(receipts.error).toBeNull();
    expect(receipts.data).toEqual(expect.arrayContaining([expect.objectContaining({ status: "cancelled", provider: "outlook" })]));
    expect(JSON.stringify(receipts.data)).not.toContain("managementToken");
    await page.close();
  } finally {
    await siteServer?.close().catch(() => {});
    if (siteRoot) rmSync(siteRoot, { recursive: true, force: true });
    if (bindingId) {
      const current = await owner.context.request.get(`/api/offerings?businessId=${businessId}`).catch(() => null);
      const currentBody = current ? await responseJson(current) : {};
      const row = array(currentBody.websiteBindings).map(object).find((item) => text(item.id) === bindingId);
      if (row) {
        await owner.context.request.post("/api/offerings/websites", {
          headers: { origin: env.app, "content-type": "application/json" },
          data: { action: "revoke_managed_website_binding", businessId, bindingId, expectedRevision: Number(row.revision), reason: "Local proof cleanup." },
        }).catch(() => {});
      }
    }
    await admin.from("tenants").delete().eq("id", tenantId);
    await redis.del("reb:tenants:all");
    await closeContext(owner.context);
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
  }
});
