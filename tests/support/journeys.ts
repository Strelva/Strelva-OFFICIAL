/**
 * Shared steps for the 1.0 signed-in journeys (tests/*-authenticated-local.spec.ts).
 *
 * Everything here talks to the isolated loopback stack only (localEnvironment()
 * refuses anything else). Operator steps run the real operator scripts
 * (scripts/convert-tenant-to-workspace.ts, scripts/business-ownership.ts) with
 * --apply, which they themselves refuse unless SUPABASE_URL is loopback. No
 * email leaves: client email is off in this stack, so the one-tap link the
 * email would carry is rebuilt here with the same signer the email uses
 * (buildWorkspaceApproveUrl), which needs APPROVE_LINK_SECRET shared by the
 * app server and the test runner.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildWorkspaceApproveUrl } from "@/lib/approve-link";
import { siteDocumentHash, siteDocumentSchema } from "@/products/websites/site-document";
import { localEnvironment } from "./local-auth";

export type Admin = SupabaseClient;
export interface Person { context: BrowserContext; userId: string; email: string }

/** The flags every 1.0 journey needs on the app server. Checked up front so a
 *  misconfigured run fails with the missing name instead of a confusing 503. */
export const JOURNEY_SERVER_FLAGS = [
  "STRELVA_WORKSPACE_RELEASE",
  "STRELVA_SYSTEMS_RELEASE",
  "STRELVA_NEEDS_YOU_RELEASE",
  "STRELVA_OWNER_ENTRY",
  "STRELVA_BOOKING_STORE_WRITE",
  // Make real approved by email link for an owner with no account (20261009140000).
  "STRELVA_MAKE_REAL_OWNER_LINK_RELEASE",
] as const;

export function journeyEnvironment() {
  const env = localEnvironment();
  const missing = JOURNEY_SERVER_FLAGS.filter((name) => process.env[name] !== "1");
  if (missing.length) throw new Error(`Set ${missing.join(", ")}=1 for the app server and this runner.`);
  if (!process.env.APPROVE_LINK_SECRET) throw new Error("Set APPROVE_LINK_SECRET (any local value) for the app server and this runner.");
  if (!process.env.CRON_SECRET) throw new Error("Set CRON_SECRET (any local value) for the app server and this runner.");
  const app = new URL(env.app);
  return { ...env, port: app.port || (app.protocol === "https:" ? "443" : "80"), protocol: app.protocol };
}

export function adminClient(): Admin {
  const env = localEnvironment();
  return createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The client admin host for a tenant: admin.<tenant>.localhost on the app's port. */
export function adminHost(tenantId: string): string {
  const env = journeyEnvironment();
  return `${env.protocol}//admin.${tenantId}.localhost:${env.port}`;
}

/**
 * A verified local identity signed in on each origin given. Session cookies
 * are host-only in Strelva, so a person signed in on the app host and on a
 * client admin host holds one cookie set per host, exactly as in production.
 */
export async function person(browser: Browser, admin: Admin, label: string, options: { email?: string; origins?: string[]; viewport?: { width: number; height: number } } = {}): Promise<Person> {
  const env = localEnvironment();
  const email = options.email ?? `local-${label}-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Could not create the local identity for ${label}.`);
  const context = await browser.newContext({ baseURL: env.app, ...(options.viewport ? { viewport: options.viewport } : {}) });
  const collected: Array<{ name: string; value: string; path: string; httpOnly: boolean }> = [];
  const auth = createServerClient(env.url, env.anon, { cookies: {
    getAll: () => [],
    setAll: (values) => { for (const cookie of values) collected.push({ name: cookie.name, value: cookie.value, path: cookie.options.path || "/", httpOnly: Boolean(cookie.options.httpOnly) }); },
  } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`The local Auth service rejected ${label}.`);
  const hosts = [env.app, ...(options.origins ?? [])].map((origin) => new URL(origin).hostname);
  await context.addCookies(hosts.flatMap((domain) => collected.map((cookie) => ({ ...cookie, domain, secure: false, sameSite: "Lax" as const }))));
  return { context, userId: created.data.user.id, email };
}

export async function makeOperator(admin: Admin, operator: Person) {
  expect((await admin.from("super_admins").insert({ user_id: operator.userId, email: operator.email })).error).toBeNull();
}

/** A fixture managed tenant, as an operator would find one before conversion. */
export async function fixtureTenant(admin: Admin, input: { siteName: string; ownerEmail: string; ownerName?: string }) {
  const tenantId = `j10-${randomUUID().slice(0, 8)}`;
  const row = await admin.from("tenants").insert({ id: tenantId, site_name: input.siteName, active: true, owner_email: input.ownerEmail, owner_name: input.ownerName ?? null })
    .select("stable_id").single();
  expect(row.error).toBeNull();
  return { tenantId, stableId: String(row.data!.stable_id) };
}

/** Run one operator script against the loopback database and parse its --json outcome. */
export function operatorScript<T>(script: "convert-tenant-to-workspace" | "business-ownership", args: string[]): T {
  const env = localEnvironment();
  const stdout = execFileSync("pnpm", ["exec", "tsx", `scripts/${script}.ts`, ...args, "--json"], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: env.url, NEXT_PUBLIC_SUPABASE_URL: env.url, SUPABASE_SERVICE_ROLE_KEY: env.service },
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = stdout.startsWith("{") ? 0 : stdout.lastIndexOf("\n{\n") + 1;
  if (start < 0) throw new Error(`${script} printed no JSON outcome.`);
  return JSON.parse(stdout.slice(start)) as T;
}

export interface ConversionOutcome { mode: string; receipt: { workspaceId: string; alreadyConverted: boolean } | null }
export interface InviteOutcome {
  mode: string;
  state?: { workspaceId: string; workspaceName: string; hasOwner: boolean };
  invitation?: { invitation: { invitationId: string; recipientEmail: string }; acceptUrl?: string; delivery: { status: string } };
}

/** The operator's conversion of one tenant into a business. Returns the business id. */
export function convertTenant(tenantId: string, operatorEmail: string): string {
  const outcome = operatorScript<ConversionOutcome>("convert-tenant-to-workspace", [tenantId, "--apply", `--operator-email=${operatorEmail}`]);
  expect(outcome.mode).toBe("apply");
  expect(outcome.receipt?.workspaceId).toMatch(/^[0-9a-f-]{36}$/);
  return outcome.receipt!.workspaceId;
}

/**
 * Strelva's agency workspace is a permanent singleton (strelva_agency_workspace
 * refuses update and delete), so a rerun on the same disposable database
 * replays the existing designation instead of naming a second one.
 */
export async function designateAgency(admin: Admin, operator: Person): Promise<{ agencyId: string; marked: number; replayed: boolean }> {
  const existing = await admin.rpc("read_platform_workspace", { p_role: "strelva_agency" });
  expect(existing.error).toBeNull();
  let agencyId = typeof existing.data === "string" ? existing.data : null;
  if (!agencyId) {
    agencyId = randomUUID();
    expect((await admin.from("workspaces").insert({ id: agencyId, kind: "agency", name: "Strelva", created_by: operator.userId })).error).toBeNull();
  }
  // The designation requires the operator to be owner or admin of the agency workspace.
  const membership = await admin.from("workspace_memberships").upsert({ workspace_id: agencyId, user_id: operator.userId, role: "admin", created_by: operator.userId }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
  expect(membership.error).toBeNull();
  const outcome = operatorScript<{ designation: { workspaceId: string; marked: number; replayed: boolean } }>("business-ownership", ["designate-agency", agencyId, `--operator-email=${operator.email}`, "--apply"]);
  expect(outcome.designation.workspaceId).toBe(agencyId);
  return { agencyId, marked: outcome.designation.marked, replayed: outcome.designation.replayed };
}

/** The operator's owner invitation. Email is not sent without Jacob's yes, so the accept link comes back. */
export function inviteOwner(tenantId: string, operatorEmail: string, recipient?: string): { acceptPath: string; workspaceName: string; invitationId: string } {
  const outcome = operatorScript<InviteOutcome>("business-ownership", ["invite-owner", tenantId, `--operator-email=${operatorEmail}`, "--apply", ...(recipient ? [`--recipient=${recipient}`] : [])]);
  expect(outcome.invitation?.delivery.status).not.toBe("sent");
  expect(outcome.invitation?.acceptUrl).toBeTruthy();
  // The link is minted for the operator host; the path is the same everywhere.
  const accept = new URL(outcome.invitation!.acceptUrl!);
  expect(accept.pathname).toMatch(/^\/workspace\/invitations\/accept\/[A-Za-z0-9_-]{20,}$/);
  return { acceptPath: accept.pathname, workspaceName: outcome.state!.workspaceName, invitationId: outcome.invitation!.invitation.invitationId };
}

/** A visitor's booking request in the one booking store, as the dual write records it. */
export async function requestBooking(admin: Admin, tenantId: string, input: { name: string; email: string; daysAhead: number; hour: number }) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + input.daysAhead);
  start.setUTCHours(input.hour, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const recorded = await admin.rpc("record_tenant_booking", {
    p_tenant_id: tenantId,
    p_via: "dual_write",
    p_booking: {
      legacyId: `bk_j10_${randomUUID().slice(0, 12)}`, status: "requested", origin: "site", timeZone: "America/New_York",
      start: start.toISOString(), end: end.toISOString(), serviceName: "Consultation", serviceRef: "consultation",
      customer: { name: input.name, email: input.email }, intakeAnswers: { notes: "Local journey fixture." },
    },
  });
  expect(recorded.error).toBeNull();
  const body = recorded.data as { status: string; booking: { id: string; status: string; workspaceId: string | null } };
  expect(body.status).toBe("recorded");
  expect(body.booking.status).toBe("requested");
  return body.booking;
}

/** A reviewed website rebuild of the converted site: the Ready Possibility Make real decides on. */
export function reviewedRebuild(workId: string, tenantId: string, createdBy: string) {
  const at = new Date().toISOString();
  const document = siteDocumentSchema.parse({
    version: 2, siteName: "Harbor", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Harbor", description: "", root: "hero" }],
    nodes: { hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Harbor Pilates" }, children: [], factIds: [] } },
    facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" },
  });
  return {
    version: 2, revision: 3, title: "Harbor rebuild", input: { requestId: `request-${randomUUID().slice(0, 8)}`, url: "https://harbor.example.test/" }, status: "review_ready",
    stages: [], checkpoint: null, sourceAudit: null, audit: null,
    pageMapping: [{ sourceUrl: "https://harbor.example.test/", targetPath: "/", carriedOver: true }],
    candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${workId}/preview` },
    approvedCandidateRevision: null, tenantId, launch: { receipt: null, readBack: null }, lastError: null, createdBy, createdAt: at, history: [],
  };
}

/** The tenant's own site host: <tenant>.localhost on the app's port (the visitor's side). */
export function tenantHost(tenantId: string): string {
  const env = journeyEnvironment();
  return `${env.protocol}//${tenantId}.localhost:${env.port}`;
}

/**
 * The one booking store serving a tenant's visitor routes, as after the
 * bookings move (spec steps 3-5): a service on the site, request-mode
 * settings with bookable hours, and seven clean days of booking parity so
 * `STRELVA_BOOKING_STORE_READ=postgres` takes effect. The parity table has no
 * RPC for past days, so it is written with psql on the disposable database
 * (STRELVA_LOCAL_DB_URL, loopback only). Needs CONTENT_SOURCE=postgres and
 * STRELVA_BOOKING_STORE_READ=postgres on the app server.
 */
export async function serveBookingsFromTheStore(admin: Admin, tenantId: string, service: { id: string; name: string }) {
  for (const name of ["STRELVA_BOOKING_STORE_READ", "CONTENT_SOURCE"] as const) {
    if (process.env[name] !== "postgres") throw new Error(`Set ${name}=postgres for the app server and this runner.`);
  }
  const dbUrl = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!dbUrl || !["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname)) throw new Error("Set STRELVA_LOCAL_DB_URL to the disposable database (loopback only).");
  const content = await admin.from("content").upsert({ tenant_id: tenantId, section: "services", data: { services: [{ id: service.id, name: service.name, duration: "60" }] } }, { onConflict: "tenant_id,section" });
  expect(content.error).toBeNull();
  const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, opens: "09:00", closes: "17:00" }));
  const settings = await admin.rpc("upsert_tenant_booking_settings", {
    p_tenant_id: tenantId, p_via: "native",
    p_settings: { mode: "request", bufferMinutes: 0, minNoticeMinutes: 0, maxAdvanceDays: 60, defaultLengthMinutes: 60, timezone: "America/New_York", bookableHours: week },
  });
  expect(settings.error).toBeNull();
  const stable = await admin.from("tenants").select("stable_id").eq("id", tenantId).single();
  expect(stable.error).toBeNull();
  const stableId = String(stable.data!.stable_id);
  if (!/^[0-9a-f-]{36}$/.test(stableId)) throw new Error("The fixture tenant has no stable id.");
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-c",
    `insert into public.tenant_client_record_parity(store, tenant_stable_id, checked_on, ok, redis_count, postgres_count, missing, mismatched)
       select 'bookings', '${stableId}'::uuid, (clock_timestamp() at time zone 'UTC')::date - d, true, 0, 0, 0, 0
       from generate_series(0, 7) d on conflict do nothing`], { stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  const streak = await admin.rpc("client_record_parity_streak", { p_store: "bookings" });
  expect(streak.error).toBeNull();
  expect(Number((streak.data as { days: number }).days)).toBeGreaterThanOrEqual(7);
}

export async function bookingStatus(admin: Admin, tenantId: string, bookingId: string): Promise<string | null> {
  const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const read = await admin.rpc("read_tenant_bookings", { p_tenant_id: tenantId, p_from: from, p_to: to });
  expect(read.error).toBeNull();
  const rows = (read.data ?? []) as Array<{ id: string; status: string }>;
  return rows.find((row) => row.id === bookingId)?.status ?? null;
}

export interface DecisionRow { id: string; workspaceId: string; title: string; state: string; revisionHash: string; sourceLifecycle: string; sourceId: string; outcome: string | null; outcomeReason: string | null; decidedByKind: string | null; deliveryState: string }

/** Owner decisions for a business, read as an identity the SQL lets in (a member or an operator). */
export async function decisions(admin: Admin, workspaceId: string, reader: { userId: string; email: string }, includeClosed = true): Promise<DecisionRow[]> {
  const read = await admin.rpc("list_owner_decisions", { p_workspace_id: workspaceId, p_user_id: reader.userId, p_verified_email: reader.email.toLowerCase(), p_include_closed: includeClosed });
  expect(read.error).toBeNull();
  return (read.data ?? []) as DecisionRow[];
}

export async function decision(admin: Admin, workspaceId: string, itemId: string): Promise<DecisionRow> {
  const read = await admin.rpc("read_owner_decision", { p_workspace_id: workspaceId, p_decision_id: itemId });
  expect(read.error).toBeNull();
  return read.data as DecisionRow;
}

/** The exact Approve / Not yet link the Needs you email carries (service.ts `links`). */
export function oneTapLink(item: { workspaceId: string; id: string; revisionHash: string }, recipient: string, action: "approve" | "not-yet"): string {
  const env = journeyEnvironment();
  return buildWorkspaceApproveUrl(env.app, { workspaceId: item.workspaceId, itemId: item.id, action, recipient, revision: item.revisionHash });
}

/**
 * Open a one-tap link the way an email client does: no session at all. GET
 * only renders the confirm step (scanners prefetch it, so it never acts).
 */
export async function openLink(browser: Browser, link: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const response = await page.goto(link);
  expect(response?.status()).toBeLessThan(500);
  return page;
}

/** Open a one-tap link and press its confirm button (the POST that decides). */
export async function decideByLink(browser: Browser, link: string, confirmLabel: RegExp): Promise<Page> {
  const page = await openLink(browser, link);
  await page.getByRole("button", { name: confirmLabel }).click();
  await page.waitForLoadState("domcontentloaded");
  return page;
}

export async function noHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** Run the hourly Needs you chase once, as Vercel cron would. */
export async function runNeedsYouChase(context: BrowserContext | { request: BrowserContext["request"] }) {
  const response = await context.request.get("/api/cron/needs-you", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<{ urgent: number; ownerNotTold: number; failed: number }>;
}

/**
 * Best-effort teardown on the disposable stack. A converted business keeps a
 * restrict link to its tenant, so the operator's rollback runs first; the
 * stack itself is thrown away after the run, so a failure here only logs.
 */
export async function cleanup(admin: Admin, input: { tenantIds?: string[]; workspaceIds?: string[]; operatorEmail?: string; people?: Person[] }) {
  for (const tenantId of input.tenantIds ?? []) {
    if (input.operatorEmail) {
      try { operatorScript("convert-tenant-to-workspace", [tenantId, "--rollback", "--apply", `--operator-email=${input.operatorEmail}`]); } catch { /* left for the disposable stack */ }
    }
  }
  for (const workspaceId of input.workspaceIds ?? []) await admin.from("workspaces").delete().eq("id", workspaceId).then(() => undefined, () => undefined);
  for (const tenantId of input.tenantIds ?? []) await admin.from("tenants").delete().eq("id", tenantId).then(() => undefined, () => undefined);
  for (const one of input.people ?? []) {
    await one.context.close().catch(() => undefined);
    await admin.from("super_admins").delete().eq("user_id", one.userId).then(() => undefined, () => undefined);
    await admin.auth.admin.deleteUser(one.userId).catch(() => undefined);
  }
}

/** The owner accepts the operator's invitation through the real page. */
export async function acceptAsOwner(owner: Person, acceptPath: string, workspaceName: string) {
  const page = await owner.context.newPage();
  await page.goto(acceptPath);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: `You joined ${workspaceName}.` })).toBeVisible();
  await expect(page.getByText("Your role is owner.")).toBeVisible();
  await page.close();
}

/**
 * Operator path to an owned, converted business: fixture tenant, conversion,
 * owner invitation, acceptance. Returns what the journeys need.
 */
export async function convertedBusinessWithOwner(browser: Browser, admin: Admin, label: string, options: { ownerOrigins?: (tenantId: string) => string[] } = {}) {
  const operator = await person(browser, admin, `${label}-operator`);
  await makeOperator(admin, operator);
  const ownerEmail = `local-${label}-owner-${randomUUID().slice(0, 8)}@example.test`;
  const tenant = await fixtureTenant(admin, { siteName: `Harbor ${label}`, ownerEmail, ownerName: "Mara Quinn" });
  const owner = await person(browser, admin, `${label}-owner`, { email: ownerEmail, origins: options.ownerOrigins?.(tenant.tenantId) ?? [] });
  const businessId = convertTenant(tenant.tenantId, operator.email);
  const invitation = inviteOwner(tenant.tenantId, operator.email);
  await acceptAsOwner(owner, invitation.acceptPath, invitation.workspaceName);
  return { operator, owner, tenantId: tenant.tenantId, businessId, workspaceName: invitation.workspaceName };
}
