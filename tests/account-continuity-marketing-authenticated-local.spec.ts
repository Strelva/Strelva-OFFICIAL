import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import { localEnvironment } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth, Postgres and Mailpit.");
test.setTimeout(120_000);

const MAILPIT_ORIGIN = process.env.STRELVA_MAILPIT_ORIGIN || "http://127.0.0.1:54324";

type MailpitSummary = {
  ID: string;
  To?: Array<{ Address?: string }>;
  Subject?: string;
};

async function mailpitSummaries(): Promise<MailpitSummary[]> {
  const response = await fetch(`${MAILPIT_ORIGIN}/api/v1/messages?limit=100`);
  if (!response.ok) throw new Error(`Local Mailpit list failed with ${response.status}.`);
  const body = await response.json() as { messages?: MailpitSummary[] };
  return body.messages || [];
}

async function freshMagicLink(email: string, existingIds: Set<string>): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const summary = (await mailpitSummaries()).find((candidate) =>
      !existingIds.has(candidate.ID)
      && candidate.Subject === "Your sign-in link"
      && candidate.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()),
    );
    if (summary) {
      const response = await fetch(`${MAILPIT_ORIGIN}/api/v1/message/${encodeURIComponent(summary.ID)}`);
      if (!response.ok) throw new Error(`Local Mailpit message read failed with ${response.status}.`);
      const body = await response.json() as { HTML?: string; Text?: string };
      const htmlLink = body.HTML?.match(/href="([^"]+\/auth\/v1\/verify\?[^\"]+)"/)?.[1];
      const textLink = body.Text?.match(/\(\s*(https?:\/\/\S+\/auth\/v1\/verify\?\S+)\s*\)/)?.[1];
      const link = (htmlLink || textLink)?.replaceAll("&amp;", "&");
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No fresh local sign-in message arrived for ${email}.`);
}

async function findAuthUser(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 5; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (result.data.users.length < 1000) break;
  }
  throw new Error("Fresh local Auth user was not provisioned.");
}

async function closeContext(context: BrowserContext | undefined) {
  await context?.close().catch(() => undefined);
}

test("the marketing composer crosses the local origin boundary into one fresh customer brief", async ({ browser }) => {
  const env = localEnvironment();
  const marketingApp = process.env.STRELVA_MARKETING_BASE_URL || "";
  if (!marketingApp || !["localhost", "127.0.0.1"].includes(new URL(marketingApp).hostname)) {
    throw new Error("This proof requires a loopback marketing origin.");
  }
  if (new URL(marketingApp).hostname !== new URL(env.app).hostname) {
    throw new Error("This proof requires both local origins to use the same loopback hostname so the continuation cookie remains same-site.");
  }
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `marketing-continuation-${randomUUID()}@example.test`;
  const context = await browser.newContext({ baseURL: marketingApp, viewport: { width: 390, height: 844 } });
  const existingMailIds = new Set((await mailpitSummaries()).map((message) => message.ID));
  let userId: string | null = null;
  let customerWorkspaceId: string | null = null;
  let continuationId: string | null = null;

  try {
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("textbox", { name: "What should be different about your business?" })).toBeEnabled();
    await page.getByRole("button", { name: "“We keep forgetting to follow up.”" }).click();
    await page.getByRole("button", { name: "Explore this change" }).click();
    await page.getByRole("button", { name: "Email", exact: true }).click();
    await page.getByRole("button", { name: "Prepare this work" }).click();

    const continuationResponse = page.waitForResponse((response) =>
      response.url() === `${env.app}/api/public-continuation`
      && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save to your account", exact: true }).click();
    const response = await continuationResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe(marketingApp.replace(/\/$/, ""));
    expect(response.headers()["access-control-allow-credentials"]).toBe("true");
    const transferred = response.request().postDataJSON() as { id?: unknown; request?: unknown; result?: unknown };
    expect(transferred).toMatchObject({
      id: expect.any(String),
      request: "We keep forgetting to follow up with people who request quotes.",
      result: "Email",
    });
    continuationId = String(transferred.id);
    await expect(page).toHaveURL(new RegExp(`${env.app.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sign-in\\?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic$`));

    await page.waitForTimeout(1_000);
    await expect(page.getByRole("button", { name: "Email me a sign-in link", exact: true })).toBeEnabled({ timeout: 15_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
    await expect(page.getByText("Check your email.", { exact: true })).toBeVisible({ timeout: 15_000 });

    const magicLink = await freshMagicLink(email, existingMailIds);
    const linkUrl = new URL(magicLink);
    expect(["127.0.0.1", "localhost"]).toContain(linkUrl.hostname);
    await page.goto(magicLink, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/workspace\/account\?continue=public$/);
    await expect(page.getByLabel("Signed-in identity").getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

    const freshUser = await findAuthUser(admin, email);
    userId = freshUser.id;
    expect(freshUser.email_confirmed_at).toBeTruthy();

    customerWorkspaceId = randomUUID();
    expect((await admin.from("workspaces").insert({
      id: customerWorkspaceId,
      kind: "customer",
      name: "Marketing Customer Business",
      created_by: userId,
    })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert({
      workspace_id: customerWorkspaceId,
      user_id: userId,
      role: "owner",
      created_by: userId,
    })).error).toBeNull();

    await page.reload();
    await expect(page.getByLabel("Signed-in identity").getByText(email, { exact: true })).toBeVisible({ timeout: 15_000 });
    const destination = page.getByLabel("Save to", { exact: true });
    await expect(destination.locator("option")).toContainText(["Marketing Customer Business · customer"], { timeout: 15_000 });
    await destination.selectOption(customerWorkspaceId);
    const saveResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/api/public-continuation/import") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "Save private brief", exact: true }).click();
    expect((await saveResponse).status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`/workspace\\?workspaceId=${customerWorkspaceId}.*view=document`));
    await expect(page.getByLabel("Document text", { exact: true })).toHaveValue(/We keep forgetting to follow up with people who request quotes/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByLabel("Document text", { exact: true })).toHaveValue(/We keep forgetting to follow up with people who request quotes/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.goto(`${env.app}/workspace/account?continue=public`);
    await expect(page.getByText("Public session saved", { exact: true })).toBeVisible();
    const imports = await admin.from("public_continuation_imports").select("work_id,workspace_id").eq("continuation_id", continuationId as string);
    expect(imports.error).toBeNull();
    expect(imports.data).toHaveLength(1);
    expect(imports.data?.[0]).toMatchObject({ workspace_id: customerWorkspaceId });
  } finally {
    await closeContext(context);
    if (customerWorkspaceId) await admin.from("workspaces").delete().eq("id", customerWorkspaceId);
    if (userId) {
      await admin.from("workspaces").delete().eq("created_by", userId);
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
});
