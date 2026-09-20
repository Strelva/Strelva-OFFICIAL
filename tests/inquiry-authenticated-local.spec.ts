import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { Redis } from "@upstash/redis";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { loadInquiryForm, submitInquiryForm } from "../custom-repo-starter/inquiry-client";

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
    capabilities: Array<{ id: string; status: string; live: { version: number; followUp?: { maxAttempts: number } } | null }>;
    changes: Array<{ requestId: string; status: string; undoAvailable: boolean }>;
    actionReceipts: Array<{ action: string; inquiryId: string | null }>;
    responsibilities: Array<{ id: string; capabilityId: string }>;
    inquiries: Array<{ id: string; fields: Record<string, string>; capabilityVersion: number; status: string; assigneeId?: string | null }>;
    timeline: Array<{ inquiryId: string; type: string; summary: string }>;
  };
  capabilities: Array<{ id: string; status: string; live: { version: number; followUp?: { maxAttempts: number } } | null }>;
  available: boolean;
  readOnly: boolean;
};

type SurfaceBody = {
  snapshot: SurfaceSnapshot;
  work?: SurfaceSnapshot["state"]["requests"][number];
  change?: { items: Array<{ path: string; after: unknown }> };
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

function clearProviderReadbackFailure(): void {
  const path = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
  if (path && existsSync(path)) unlinkSync(path);
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
    await redis.del(`leads:${tenantId}`, "reb:tenants:all");
  } catch {
    // The tenant is unique to this isolated run. A Redis cleanup blip cannot
    // turn the proof into a false success or touch another tenant's keys.
  }
}

test("real local Auth and Postgres preserve an inquiry through publish and undo", async ({ browser }) => {
  clearProviderReadbackFailure();
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

    // The test inserts through the Postgres authority. Invalidate only this
    // isolated Redis harness's tenant-list cache so the running app sees the
    // new UUID tenant instead of a list cached by an earlier proof.
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL!;
    expect(["localhost", "127.0.0.1"], "Redis must remain isolated to loopback.").toContain(new URL(redisUrl).hostname);
    const redis = new Redis({ url: redisUrl, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
    await redis.del("reb:tenants:all");

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
        followUpAfterMinutes: 1,
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
      input: {
        hours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
        preAuthorizedActions: ["reply", "send_message", "schedule_follow_up"],
        approval: [],
        budget: { dailyMessages: 20, timezone: "UTC" },
      },
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
    expect(capability?.status, published.message).toMatch(/^live/);
    expect(capability?.live?.version).toBeGreaterThan(0);
    expect(capability?.live?.followUp?.maxAttempts).toBe(1);
    expect(published.snapshot.state.changes.some((change) => change.requestId === requestId && change.status.startsWith("published"))).toBe(true);

    // Exercise the same portable client used by a generated customer site.
    const form = await loadInquiryForm(env.app, tenantId, capability!.id);
    expect(form.capabilityId).toBe(capability!.id);
    expect(form.version).toBe(capability!.live?.version);

    const providerBefore = providerLogCount();
    const fields = fieldsFor(form);
    await submitInquiryForm(env.app, tenantId, form, fields);
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

    const assigned = await postSurface(owner.context.request, env.app, tenantId, afterIntake.snapshot.revision, {
      kind: "bulk-record",
      recordIds: [record!.id],
      action: "assign",
    });
    const assignedRecord = assigned.snapshot.state.inquiries.find((item) => item.id === record!.id);
    expect(assignedRecord).toMatchObject({ status: "assigned", assigneeId: owner.userId });
    expect(assigned.change?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: `inquiries.${record!.id}.assigneeId`, after: owner.userId }),
    ]));

    const recordPage = await owner.context.newPage();
    page = recordPage;
    await recordPage.setViewportSize({ width: 1280, height: 800 });
    await recordPage.goto(`/business/${tenantId}?view=receipt&request=${encodeURIComponent(requestId!)}`, { waitUntil: "domcontentloaded" });
    await expect(recordPage.getByRole("heading", { name: "A record of what changed.", exact: true })).toBeVisible();
    await expect(recordPage.getByText("Receipt", { exact: true }).first()).toBeVisible();

    await recordPage.goto(`/business/${tenantId}?view=record&inquiry=${encodeURIComponent(record!.id)}`, { waitUntil: "domcontentloaded" });
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await expect(recordPage.getByRole("heading", { name: "The submitted input", exact: true })).toBeVisible();
    await expect(recordPage.getByText(`Assigned to ${owner.userId}`, { exact: true })).toBeVisible();
    await expect(recordPage.getByRole("region", { name: "Facts and outcomes" }).getByText("The customer submitted the inquiry form.", { exact: true })).toBeVisible();
    await expect(recordPage.getByRole("region", { name: "Messages for this inquiry" })).toBeVisible();
    await expect(recordPage.getByRole("button", { name: "Review current message", exact: true })).toBeVisible();
    const preparedResponse = recordPage.waitForResponse((response) => response.url().endsWith("/api/inquiry-workspace/message-review") && response.request().postDataJSON().operation === "prepare");
    await recordPage.getByRole("button", { name: "Review current message", exact: true }).click();
    const prepared = await preparedResponse;
    expect(prepared.status(), await prepared.text()).toBe(200);
    await expect(recordPage.locator("[data-message-review]")).toContainText(fields.email!);
    expect(providerLogCount()).toBe(providerBefore);
    const approvedResponse = recordPage.waitForResponse((response) => response.url().endsWith("/api/inquiry-workspace/message-review") && response.request().postDataJSON().operation === "approve");
    await recordPage.getByRole("button", { name: "Send this message", exact: true }).click();
    const approved = await approvedResponse;
    expect(approved.status(), await approved.text()).toBe(200);
    const approvedBody = await approved.json() as { outcome: { status: string; reason?: string } };
    expect(approvedBody.outcome.status, JSON.stringify(approvedBody)).toMatch(/^(verified|delivered)$/);
    await expect(recordPage.getByRole("button", { name: "Send this message", exact: true })).toHaveCount(0);
    expect(providerLogCount()).toBe(providerBefore + 1);
    await recordPage.screenshot({ path: "output/inquiry-approved-message-desktop.png", fullPage: true });

    const readbackFailureFields = { ...fields, name: "Jordan Buyer", email: "readback-loss@example.test" };
    await submitInquiryForm(env.app, tenantId, form, readbackFailureFields);
    const afterReadbackIntake = await getSurface(owner.context.request, tenantId);
    const readbackRecord = afterReadbackIntake.snapshot.state.inquiries.find((item) => item.fields.email === readbackFailureFields.email);
    expect(readbackRecord).toBeTruthy();
    leadIds.push(readbackRecord!.id);
    const prepareFailure = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      data: { operation: "prepare", tenantId, inquiryId: readbackRecord!.id, action: "reply" },
      headers: { origin: env.app },
    });
    expect(prepareFailure.status(), await prepareFailure.text()).toBe(200);
    const failureReview = (await prepareFailure.json()).review;
    const readbackFailurePath = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
    expect(readbackFailurePath, "The local proof must inject one provider read-back loss.").toBeTruthy();
    writeFileSync(readbackFailurePath!, "fail the next provider read-back\n", { mode: 0o600 });
    const acceptedUnverified = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      data: { operation: "approve", tenantId, inquiryId: readbackRecord!.id, action: "reply", reviewToken: failureReview.reviewToken, messageDigest: failureReview.messageDigest },
      headers: { origin: env.app },
    });
    expect(acceptedUnverified.status(), await acceptedUnverified.text()).toBe(200);
    expect((await acceptedUnverified.json()).outcome).toMatchObject({ status: "accepted_unverified", retryable: false });
    expect(providerLogCount()).toBe(providerBefore + 2);
    const duplicate = await owner.context.request.post("/api/inquiry-workspace/message-review", {
      data: { operation: "approve", tenantId, inquiryId: readbackRecord!.id, action: "reply", reviewToken: failureReview.reviewToken, messageDigest: failureReview.messageDigest },
      headers: { origin: env.app },
    });
    expect(duplicate.status(), await duplicate.text()).toBe(200);
    const recovered = (await duplicate.json()).outcome;
    expect(recovered).toMatchObject({ status: "accepted_unverified", retryable: false });
    expect(providerLogCount()).toBe(providerBefore + 2);

    const afterMessages = await getSurface(owner.context.request, tenantId);
    const promoted = await postSurface(owner.context.request, env.app, tenantId, afterMessages.snapshot.revision, {
      kind: "promote-responsibility", responsibilityId: responsibility!.id,
    });
    expect(promoted.snapshot.state.responsibilities.find((item) => item.id === responsibility!.id)).toMatchObject({
      trust: "trusted",
      allowedActions: expect.arrayContaining(["send_message", "reply", "schedule_follow_up"]),
    });
    const handled = await postSurface(owner.context.request, env.app, tenantId, promoted.snapshot.revision, {
      kind: "bulk-record", recordIds: [record!.id, readbackRecord!.id], action: "mark_handled",
    });
    expect(handled.snapshot.state.inquiries.find((item) => item.id === record!.id)?.status).toBe("handled");
    expect(handled.snapshot.state.inquiries.find((item) => item.id === readbackRecord!.id)?.status).toBe("handled");

    // Exercise the due worker through its authenticated local cron seam with a
    // second, untouched inquiry. The first pass sends the governed owner
    // notification and acknowledgement; the follow-up pass then proves the
    // provider read-back before sending. A deliberately unavailable read-back
    // is recoverable, and the durable max-attempt marker makes the later replay
    // send nothing.
    expect(capability?.live?.version).toBeGreaterThan(0);
    expect(published.snapshot.state.capabilities.find((item) => item.id === capability!.id)?.live).toMatchObject({ version: capability!.live!.version });
    const noReplyFields = { ...fields, name: "No Reply Buyer", email: "no-reply-follow-up@example.test" };
    await submitInquiryForm(env.app, tenantId, form, noReplyFields);
    const afterNoReplyIntake = await getSurface(owner.context.request, tenantId);
    const noReplyRecord = afterNoReplyIntake.snapshot.state.inquiries.find((item) => item.fields.email === noReplyFields.email);
    expect(noReplyRecord).toBeTruthy();
    leadIds.push(noReplyRecord!.id);
    expect(capability?.live?.version).toBeGreaterThan(0);

    const cronSecret = process.env.CRON_SECRET;
    expect(cronSecret, "The local proof must configure the cron secret.").toBeTruthy();
    const runFollowUpCron = async () => {
      const response = await owner.context.request.get("/api/cron/inquiry-follow-ups", {
        headers: { authorization: `Bearer ${cronSecret}` },
      });
      expect(response.status(), await response.text()).toBe(200);
      return json<{ results: Array<{ inquiryId: string; action: string; status: string; reason?: string }> }>(response);
    };

    const providerBeforeFollowUp = providerLogCount();
    const acknowledgementSweep = await runFollowUpCron();
    expect(acknowledgementSweep.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ inquiryId: noReplyRecord!.id, action: "owner_notification", status: "verified" }),
    ]));
    expect(providerLogCount()).toBe(providerBeforeFollowUp + 2);

    // Move the accepted acknowledgement behind the one-minute rule without
    // waiting in the browser test. This edits only this proof tenant's local
    // delivery checkpoint and leaves the lead/source record intact.
    const replyCheckpointKey = `reb:inquiry-delivery:${encodeURIComponent(tenantId)}:${encodeURIComponent(noReplyRecord!.id)}:reply`;
    const replyCheckpoint = await redis.get<Record<string, unknown>>(replyCheckpointKey);
    expect(replyCheckpoint).toMatchObject({ status: "verified", attempts: 1 });
    if (!replyCheckpoint) throw new Error("The acknowledgement checkpoint was not persisted.");
    await redis.set(replyCheckpointKey, { ...replyCheckpoint, acceptedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() }, { ex: 90 * 24 * 60 * 60 });

    const followUpReadbackFailurePath = process.env.STRELVA_LOCAL_PROVIDER_READBACK_FAILURE_FILE;
    expect(followUpReadbackFailurePath, "The local proof must configure a provider read-back failure path.").toBeTruthy();
    writeFileSync(followUpReadbackFailurePath!, "fail one follow-up recheck\n", { mode: 0o600 });
    const unavailableSweep = await runFollowUpCron();
    expect(unavailableSweep.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ inquiryId: noReplyRecord!.id, action: "schedule_follow_up", status: "paused" }),
    ]));
    expect(providerLogCount()).toBe(providerBeforeFollowUp + 2);

    const recoveredSweep = await runFollowUpCron();
    expect(recoveredSweep.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ inquiryId: noReplyRecord!.id, action: "schedule_follow_up", status: "verified" }),
    ]));
    expect(providerLogCount()).toBe(providerBeforeFollowUp + 3);
    const followUpCheckpointKey = `reb:inquiry-delivery:${encodeURIComponent(tenantId)}:${encodeURIComponent(noReplyRecord!.id)}:schedule_follow_up`;
    const followUpCheckpoint = await redis.get<Record<string, unknown>>(followUpCheckpointKey);
    expect(followUpCheckpoint).toMatchObject({ status: "verified", attempts: 1 });

    const replaySweep = await runFollowUpCron();
    expect(replaySweep.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ inquiryId: noReplyRecord!.id, action: "schedule_follow_up", status: "verified" }),
    ]));
    expect(providerLogCount()).toBe(providerBeforeFollowUp + 3);

    const handledNoReply = await postSurface(owner.context.request, env.app, tenantId, afterNoReplyIntake.snapshot.revision, {
      kind: "bulk-record", recordIds: [noReplyRecord!.id], action: "mark_handled",
    });
    expect(handledNoReply.snapshot.state.inquiries.find((item) => item.id === noReplyRecord!.id)?.status).toBe("handled");
    const handledSweep = await runFollowUpCron();
    expect(handledSweep.results.some((result) => result.inquiryId === noReplyRecord!.id)).toBe(false);
    expect(providerLogCount()).toBe(providerBeforeFollowUp + 3);

    await recordPage.reload();
    await expect(recordPage.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
    await expect(recordPage.getByLabel("The submitted input").getByText("handled", { exact: true })).toBeVisible();
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
