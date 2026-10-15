import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  actor: vi.fn(), released: vi.fn(() => true), mayBeOn: vi.fn(() => true), eventsReleased: vi.fn(async () => true), webhooksOn: vi.fn(() => true),
  isSuperAdmin: vi.fn(), operatorContext: vi.fn(), tenantWorkspace: vi.fn(), audit: vi.fn(),
  read: vi.fn(), run: vi.fn(), readOperator: vi.fn(), retryOperator: vi.fn(),
}));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: m.released }));
vi.mock("@/platform/app-events/release", () => ({ appEventsMayBeOn: m.mayBeOn, appEventsReleased: m.eventsReleased, appEventWebhooksEnabled: m.webhooksOn }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: m.isSuperAdmin, getActorContext: m.operatorContext }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn() }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: m.tenantWorkspace }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: m.audit }));
vi.mock("@/platform/workspaces/http", async () => ({ ...(await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http")), workspaceHttpActor: m.actor }));
vi.mock("@/platform/app-events/service", async () => ({
  ...(await vi.importActual<typeof import("@/platform/app-events/service")>("@/platform/app-events/service")),
  readAppEventDeliveries: m.read, runAppEventCommand: m.run, readOperatorAppEventDeliveries: m.readOperator, operatorRetryAppEvent: m.retryOperator,
}));

import { GET, POST } from "@/app/api/workspace/app-events/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/tenants/[id]/app-events/route";
import type { AppEventsCommand } from "@/platform/app-events/contracts";
import { WebhooksOffError, type CommandDeps } from "@/platform/app-events/service";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const actualService = await vi.importActual<typeof import("@/platform/app-events/service")>("@/platform/app-events/service");

const AGENCY = "28100000-0000-4000-8000-000000000020";
const WS = "28100000-0000-4000-8000-000000000010";
const LETTER = "28100000-0000-4000-8000-0000000000dd";
const ENDPOINT = "28100000-0000-4000-8000-0000000000e1";
const actor = { userId: "28100000-0000-4000-8000-000000000003", verifiedEmail: "agency@example.test" };
const url = "http://localhost:3000/api/workspace/app-events";
const view = {
  workspaceId: WS, viewer: { kind: "agency", canChange: true }, captureOn: true, stream: { lastSequence: 3, lastEventAt: null },
  counts: [], lanes: [], deadLetters: [{ id: LETTER, subscriber: "app:bookings:ha", eventId: null, type: "booking.made", sequence: 2, subjectKind: "booking", occurredAt: "x", attempts: 8, lastError: "boom", deadAt: "x", replayRequestedAt: null, replayedAt: null, replayOutcome: null }], endpoints: [],
};
const endpointView = { id: ENDPOINT, url: "https://maker.example.test/e", eventTypes: ["booking.made"], status: "active", disabledReason: null, secretHint: "wxyz", createdByKind: "agency", agencyName: "Agency", createdAt: "x" };
const post = (value: unknown, origin = "http://localhost:3000") => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
const params = { params: Promise.resolve({ id: "harbor" }) };
const adminPostRequest = (value: unknown) => new Request("http://localhost:3000/api/admin/tenants/harbor/app-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

beforeEach(() => {
  vi.clearAllMocks();
  m.released.mockReturnValue(true);
  m.mayBeOn.mockReturnValue(true);
  m.eventsReleased.mockResolvedValue(true);
  m.webhooksOn.mockReturnValue(true);
  m.actor.mockResolvedValue(actor);
  m.read.mockResolvedValue(view);
  m.run.mockResolvedValue({ view });
  m.isSuperAdmin.mockResolvedValue(true);
  m.operatorContext.mockResolvedValue({ userId: "op", email: "op@example.test", type: "super_admin", isSuperAdmin: true });
  m.tenantWorkspace.mockResolvedValue(WS);
  m.audit.mockResolvedValue({});
  m.readOperator.mockResolvedValue({ ...view, viewer: { kind: "operator", canChange: true } });
  m.retryOperator.mockResolvedValue({ ...view, viewer: { kind: "operator", canChange: true } });
});

describe("workspace events route", () => {
  it("answers 503 while the flag is off, before reading anything", async () => {
    m.mayBeOn.mockReturnValue(false);
    const response = await GET(new Request(`${url}?workspaceId=${WS}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Events aren't turned on." });
    expect((await POST(post({ action: "retry", workspaceId: WS, deadLetterId: LETTER }))).status).toBe(503);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.run).not.toHaveBeenCalled();
    m.mayBeOn.mockReturnValue(true);
    m.released.mockReturnValue(false);
    expect((await GET(new Request(`${url}?workspaceId=${WS}`))).status).toBe(503);
  });

  it("answers 503 when this business's row is off", async () => {
    m.eventsReleased.mockResolvedValue(false);
    expect((await GET(new Request(`${url}?workspaceId=${WS}`))).status).toBe(503);
    expect((await POST(post({ action: "retry", workspaceId: WS, deadLetterId: LETTER }))).status).toBe(503);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.run).not.toHaveBeenCalled();
  });

  it("needs a signed-in actor and passes only the session actor and the exact scope", async () => {
    m.actor.mockResolvedValue(null);
    expect((await GET(new Request(`${url}?workspaceId=${WS}`))).status).toBe(401);
    m.actor.mockResolvedValue(actor);
    const response = await GET(new Request(`${url}?workspaceId=${WS}&agencyWorkspaceId=${AGENCY}`));
    expect(response.status).toBe(200);
    expect(m.read).toHaveBeenCalledWith(actor, { workspaceId: WS, agencyWorkspaceId: AGENCY });
    expect(await response.json()).toMatchObject({ workspaceId: WS, webhooksOn: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await GET(new Request(`${url}?workspaceId=${WS}`));
    expect(m.read).toHaveBeenLastCalledWith(actor, { workspaceId: WS, agencyWorkspaceId: null });
  });

  it("rejects a bad workspace id and cross-origin writes", async () => {
    expect((await GET(new Request(`${url}?workspaceId=nope`))).status).toBe(400);
    expect((await GET(new Request(url))).status).toBe(400);
    expect((await POST(post({ action: "retry", workspaceId: WS, deadLetterId: LETTER }, "https://untrusted.example"))).status).toBe(403);
    expect((await POST(post({ action: "retry", workspaceId: WS, deadLetterId: LETTER, actorId: "x" }))).status).toBe(400);
    expect((await POST(post({ action: "create_webhook", workspaceId: WS, url: "http://maker.example.test/e", eventTypes: ["booking.made"] }))).status).toBe(400);
    expect(m.run).not.toHaveBeenCalled();
  });

  it("runs a retry", async () => {
    const command = { action: "retry", workspaceId: WS, agencyWorkspaceId: AGENCY, deadLetterId: LETTER };
    const response = await POST(post(command));
    expect(response.status).toBe(200);
    expect(m.run).toHaveBeenCalledWith(actor, command);
  });

  it("answers 503 for a Webhook command while Webhooks are off", async () => {
    m.run.mockRejectedValue(new WebhooksOffError());
    const response = await POST(post({ action: "create_webhook", workspaceId: WS, url: "https://maker.example.test/e", eventTypes: ["booking.made"] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Webhooks aren't turned on." });
  });

  it("returns a new secret once, with no-store", async () => {
    m.run.mockResolvedValue({ view: endpointView, secret: "whsec_abc" });
    const response = await POST(post({ action: "create_webhook", workspaceId: WS, agencyWorkspaceId: AGENCY, url: "https://maker.example.test/e", eventTypes: ["booking.made"] }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ view: endpointView, secret: "whsec_abc" });
    // The next read never carries it.
    const read = await GET(new Request(`${url}?workspaceId=${WS}&agencyWorkspaceId=${AGENCY}`));
    expect(JSON.stringify(await read.json())).not.toContain("whsec_");
  });

  it("does not swallow a refusal or a conflict", async () => {
    m.run.mockRejectedValue(new WorkspaceAccessError());
    expect((await POST(post({ action: "retry", workspaceId: WS, deadLetterId: LETTER }))).status).toBe(403);
    m.run.mockRejectedValue(new WorkspaceConflictError("This client already has 5 webhooks. Turn one off first."));
    const response = await POST(post({ action: "retry", workspaceId: WS, deadLetterId: LETTER }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This client already has 5 webhooks. Turn one off first." });
    m.read.mockRejectedValue(new WorkspaceAccessError());
    expect((await GET(new Request(`${url}?workspaceId=${WS}`))).status).toBe(403);
  });
});

describe("operator events route", () => {
  it("answers 403 to anyone but a super admin, and 503 with the flag off", async () => {
    m.isSuperAdmin.mockResolvedValue(false);
    expect((await adminGet(new Request("http://localhost/x"), params)).status).toBe(403);
    expect((await adminPost(adminPostRequest({ action: "retry", deadLetterId: LETTER }), params)).status).toBe(403);
    m.isSuperAdmin.mockResolvedValue(true);
    m.mayBeOn.mockReturnValue(false);
    expect((await adminGet(new Request("http://localhost/x"), params)).status).toBe(503);
    expect(m.readOperator).not.toHaveBeenCalled();
  });

  it("explains an unlinked client", async () => {
    m.tenantWorkspace.mockResolvedValue(null);
    const response = await adminGet(new Request("http://localhost/x"), params);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This client has no linked business, so events don't apply." });
  });

  it("reads for the operator", async () => {
    const response = await adminGet(new Request("http://localhost/x"), params);
    expect(response.status).toBe(200);
    expect(m.readOperator).toHaveBeenCalledWith("op@example.test", WS);
  });

  it("retries one of this client's events and writes an audit event", async () => {
    const response = await adminPost(adminPostRequest({ action: "retry", deadLetterId: LETTER }), params);
    expect(response.status).toBe(200);
    expect(m.retryOperator).toHaveBeenCalledWith("op@example.test", LETTER);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ tenant: "harbor", action: "tenant.app-events.retry", metadata: { deadLetterId: LETTER, eventType: "booking.made", sequence: 2 } }));
  });

  it("refuses a dead letter that is not this client's, and bad bodies", async () => {
    const other = "28100000-0000-4000-8000-0000000000de";
    expect((await adminPost(adminPostRequest({ action: "retry", deadLetterId: other }), params)).status).toBe(404);
    expect(m.retryOperator).not.toHaveBeenCalled();
    expect((await adminPost(adminPostRequest({ action: "retry", deadLetterId: "nope" }), params)).status).toBe(400);
    expect((await adminPost(adminPostRequest({ action: "delete" }), params)).status).toBe(400);
  });
});

describe("runAppEventCommand", () => {
  const sealed = "enc:v1:sealed";
  const store = () => ({
    retryDeadLetter: vi.fn(async () => view),
    createWebhookEndpoint: vi.fn(async () => endpointView),
    setWebhookEndpoint: vi.fn(async () => endpointView),
  });
  const deps = (patch: Partial<CommandDeps> = {}): CommandDeps => ({
    store: store() as unknown as CommandDeps["store"], webhooksOn: true, validateUrl: async (value) => value.trim(),
    newSecret: () => ({ secret: "whsec_plain_secret", hint: "cret" }), encrypt: () => sealed, ...patch,
  });
  const base = { workspaceId: WS, agencyWorkspaceId: AGENCY };

  it("allows pause and turn-off with the Webhooks switch off, and refuses the rest", async () => {
    const d = deps({ webhooksOn: false });
    await expect(actualService.runAppEventCommand(actor, { ...base, action: "set_webhook", endpointId: ENDPOINT, status: "paused" }, d)).resolves.toEqual({ view: endpointView });
    await expect(actualService.runAppEventCommand(actor, { ...base, action: "set_webhook", endpointId: ENDPOINT, status: "disabled" }, d)).resolves.toBeTruthy();
    const refused: AppEventsCommand[] = [
      { ...base, action: "set_webhook", endpointId: ENDPOINT, status: "active" },
      { ...base, action: "rotate_webhook_secret", endpointId: ENDPOINT },
      { ...base, action: "create_webhook", url: "https://maker.example.test/e", eventTypes: ["booking.made"] },
    ];
    for (const command of refused) {
      await expect(actualService.runAppEventCommand(actor, command, d), command.action).rejects.toBeInstanceOf(WebhooksOffError);
    }
  });

  it("seals the secret, returns it once, and never passes it on in the clear", async () => {
    const d = deps();
    const result = await actualService.runAppEventCommand(actor, { ...base, action: "create_webhook", url: " https://maker.example.test/e ", eventTypes: ["booking.made"] }, d);
    expect(result).toEqual({ view: endpointView, secret: "whsec_plain_secret" });
    expect(d.store.createWebhookEndpoint).toHaveBeenCalledWith(actor, { workspaceId: WS, agencyWorkspaceId: AGENCY }, {
      url: "https://maker.example.test/e", eventTypes: ["booking.made"], secretCiphertext: sealed, secretHint: "cret",
    });
    expect(JSON.stringify(vi.mocked(d.store.createWebhookEndpoint).mock.calls)).not.toContain("whsec_plain_secret");
    expect(JSON.stringify(result.view)).not.toContain("whsec_");
  });

  it("rotates a secret with status null", async () => {
    const d = deps();
    const result = await actualService.runAppEventCommand(actor, { ...base, action: "rotate_webhook_secret", endpointId: ENDPOINT }, d);
    expect(result).toMatchObject({ secret: "whsec_plain_secret" });
    expect(d.store.setWebhookEndpoint).toHaveBeenCalledWith(actor, { workspaceId: WS, agencyWorkspaceId: AGENCY }, {
      endpointId: ENDPOINT, status: null, secretCiphertext: sealed, secretHint: "cret",
    });
  });

  it("refuses to keep a secret in the clear when the platform key is missing", async () => {
    const d = deps({ encrypt: (plain) => plain });
    await expect(actualService.runAppEventCommand(actor, { ...base, action: "create_webhook", url: "https://maker.example.test/e", eventTypes: ["booking.made"] }, d)).rejects.toThrow("Nothing changed.");
    expect(d.store.createWebhookEndpoint).not.toHaveBeenCalled();
  });

  it("scopes a business command with a null agency", async () => {
    const d = deps();
    await actualService.runAppEventCommand(actor, { action: "retry", workspaceId: WS, deadLetterId: LETTER }, d);
    expect(d.store.retryDeadLetter).toHaveBeenCalledWith(actor, { workspaceId: WS, agencyWorkspaceId: null }, LETTER);
  });
});

