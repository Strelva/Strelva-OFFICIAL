import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";

const deps = vi.hoisted(() => ({ limited: vi.fn(), flag: vi.fn(), form: vi.fn(), submit: vi.fn() }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: deps.limited, rateLimitKey: (_req: Request, prefix: string) => prefix }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: deps.flag }));
vi.mock("@/products/vertical-intake/server", async () => {
  const store = await import("@/products/vertical-intake/store");
  return { readPublicIntakeForm: deps.form, submitPublicIntake: deps.submit, IntakeUnavailableError: store.IntakeUnavailableError };
});

import { setConnectedSitesStoreForTests, ConnectedSiteInputError } from "@/products/connected-sites/store";
import { IntakeUnavailableError } from "@/products/vertical-intake/store";
import { GET, OPTIONS as formOptions } from "@/app/api/v1/connect/[siteKey]/apps/[appId]/route";
import { POST, OPTIONS as intakeOptions } from "@/app/api/v1/connect/[siteKey]/apps/[appId]/intake/route";

const KEY = "sk_pub_abcdefghijklmnopqrstuvwx";
const ORIGIN = "https://north.example";
const site = { id: "82000000-0000-4000-8000-000000000003", workspaceId: "82000000-0000-4000-8000-000000000002", siteUrl: `${ORIGIN}/`, siteHost: "north.example", allowedOrigins: [ORIGIN], captureForms: true, injectSchema: true, verified: true };
const params = (appId = "dental_intake", siteKey = KEY) => ({ params: Promise.resolve({ siteKey, appId }) });
const get = (appId?: string) => GET(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/apps/dental_intake`), params(appId));
const post = (body: unknown = { id: "intake-12345678", answers: { name: "Pat" } }, origin: string | null = ORIGIN, appId?: string) =>
  POST(new Request(`https://app.strelva.test/api/v1/connect/${KEY}/apps/dental_intake/intake`, { method: "POST", headers: { "content-type": "text/plain", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }), params(appId));

describe("Dental intake public routes", () => {
  beforeEach(() => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
    deps.limited.mockReset().mockResolvedValue(false);
    deps.flag.mockReset().mockResolvedValue(true);
    deps.form.mockReset().mockResolvedValue({ schemaVersion: 1, appId: "dental_intake", release: 1, fields: [] });
    deps.submit.mockReset().mockResolvedValue({ status: "recorded", id: "82000000-0000-4000-8000-0000000000bb", triage: "routine" });
    setConnectedSitesStoreForTests({ resolve: vi.fn(async () => site) } as unknown as ConnectedSitesStore);
  });
  afterEach(() => { vi.unstubAllEnvs(); setConnectedSitesStoreForTests(null); });

  it("is off when connected sites are off", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect((await get()).status).toBe(503);
    expect((await post()).status).toBe(503);
    expect(deps.form).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown App, before reading anything", async () => {
    expect((await get("law_intake")).status).toBe(404);
    expect((await post(undefined, ORIGIN, "law_intake")).status).toBe(404);
    expect(deps.form).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it("serves the form with wildcard CORS and no caching", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ schemaVersion: 1, appId: "dental_intake" });
  });

  it("says the form is not available when there is none", async () => {
    deps.form.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This form isn't available right now. Please call the office." });
  });

  it("answers preflight on both routes", async () => {
    expect((await formOptions()).status).toBe(204);
    expect((await intakeOptions()).status).toBe(204);
  });

  it("refuses a missing or foreign Origin on the write, storing nothing", async () => {
    expect((await post(undefined, null)).status).toBe(403);
    expect((await post(undefined, "https://evil.example")).status).toBe(403);
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it("records an intake and returns its id and triage", async () => {
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: "82000000-0000-4000-8000-0000000000bb", triage: "routine" });
    expect(deps.submit).toHaveBeenCalledWith(KEY, expect.objectContaining({ workspaceId: site.workspaceId }), ORIGIN, "dental_intake", { id: "intake-12345678", answers: { name: "Pat" } });
  });

  it("reports a repeat as 200", async () => {
    deps.submit.mockResolvedValue({ status: "duplicate", id: "82000000-0000-4000-8000-0000000000bb", triage: "urgent" });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ triage: "urgent" });
  });

  it("answers spam and honeypots like a success, with a random id", async () => {
    deps.submit.mockResolvedValue({ status: "held_as_spam" });
    const held = await post();
    expect(held.status).toBe(201);
    const heldBody = await held.json() as { ok: boolean; id: string; triage: string };
    expect(heldBody).toMatchObject({ ok: true, triage: "routine" });
    expect(heldBody.id).toMatch(/^[0-9a-f-]{36}$/);
    deps.submit.mockResolvedValue({ status: "ignored" });
    expect((await post()).status).toBe(201);
  });

  it("answers 409 when the form is not live", async () => {
    deps.submit.mockRejectedValue(new IntakeUnavailableError());
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This form isn't available right now. Please call the office." });
  });

  it("passes a plain correction message through as a 400", async () => {
    deps.submit.mockRejectedValue(new ConnectedSiteInputError("Please answer: What is the visit for?."));
    const response = await post();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Please answer: What is the visit for?." });
  });

  it("fails the write closed when the limiter is down, and the read open", async () => {
    deps.limited.mockRejectedValue(new Error("redis down"));
    expect((await post()).status).toBe(429);
    expect(deps.submit).not.toHaveBeenCalled();
    expect((await get()).status).toBe(200);
  });

  it("limits each route on its own key", async () => {
    deps.limited.mockResolvedValue(true);
    expect((await get()).status).toBe(429);
    expect((await post()).status).toBe(429);
    expect(deps.limited).toHaveBeenCalledWith(`v1-connect-app-form:${KEY}`, 60);
    expect(deps.limited).toHaveBeenCalledWith(`v1-connect-app-intake:${KEY}`, 10);
  });
});
