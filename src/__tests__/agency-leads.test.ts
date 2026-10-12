import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import type { LeadWorkflow } from "@/platform/infra/lead-workflow-contracts";
import { AGENCY_LEAD_COMMAND_SCRIPT } from "@/platform/infra/agency-leads";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), members: vi.fn(), redis: vi.fn(), mirror: vi.fn(), brand: vi.fn() }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand }));
vi.mock("@/platform/workspaces/agency-onboarding", () => ({ listMemberAgencies: mocks.members }));
vi.mock("@/platform/infra/db/repositories", () => ({ upsertLead: mocks.mirror }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/platform/workspaces/http", async () => ({ ...await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http"), workspaceHttpActor: mocks.actor }));
import { GET, POST } from "@/app/api/agency/leads/route";
import { beginAgencyLeadConversion, completeAgencyLeadConversion, readAgencyLead } from "@/experience/workspace/leads/leads-server";

const agency = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const key = "44444444-4444-4444-8444-444444444444";
const business = "55555555-5555-4555-8555-555555555555";
const token = "a".repeat(36);
const actor = { userId: actorId, verifiedEmail: "agency@example.test" };
const member = { id: agency, name: "Strelva Agency", role: "owner" };
const fixture = (fields: Partial<DeliveryLead> = {}): DeliveryLead => ({ businessName: "Northside Bakery", email: "owner@bakery.example", statusToken: token, deliveryStatus: "received", submittedAt: "2026-10-01T12:00:00Z", statusUpdatedAt: "2026-10-01T12:00:00Z", ...fields });
const stageToStatus = { received: "new", reviewing: "contacted", drafting: "converting", owner_review: "converting", launch_ready: "converting", launched: "converted", paused: "dismissed" } as const;

/** Atomic provider-reply double, matching pay-links qualification. This tests
 * application authority/replay contracts; it does not execute native Lua. */
function store() {
  const records = new Map<string, unknown>();
  const members: string[] = [];
  const redis = {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    zrange: vi.fn(async () => members),
    eval: vi.fn(async (_script: string, keys: string[], args: string[]) => {
      const [owner, requestedToken, email, fingerprint, action, commandKey, now, value, user] = args as [string, string, string, string, string, string, string, string, string];
      const lead = records.get(keys[0]!) as DeliveryLead | undefined;
      if (!lead) return { error: "missing" };
      if ((lead.agencyWorkspaceId != null && lead.agencyWorkspaceId !== owner) || (lead.requestType != null && lead.requestType !== "agency_service") || lead.statusToken !== requestedToken || lead.email !== email) return { error: "access" };
      const prior = records.get(keys[3]!) as { fingerprint: string; result: unknown } | undefined;
      if (prior) return prior.fingerprint === fingerprint ? structuredClone(prior.result) : { error: "conflict" };
      const next = structuredClone(lead);
      const workflow = structuredClone(records.get(keys[2]!) ?? { token: requestedToken, updatedAt: null }) as LeadWorkflow;
      workflow.status = stageToStatus[next.deliveryStatus];
      if (action === "note") {
        workflow.notes ??= [];
        if (workflow.notes.length >= 100) return { error: "notes_full" };
        workflow.notes.push({ id: commandKey, text: value, createdAt: now, createdBy: user });
        workflow.note = workflow.note ? `${workflow.note}\n\n${value}` : value;
      } else if (action === "begin") {
        if (next.conversion && (next.conversion.idempotencyKey !== commandKey || next.conversion.actorId !== user || next.conversion.fingerprint !== fingerprint)) return { error: "conversion_locked" };
        if (!next.conversion && workflow.status === "converted") return { error: "converted" };
        next.conversion ??= { idempotencyKey: commandKey, actorId: user, fingerprint, input: JSON.parse(value) };
        next.deliveryStatus = next.conversion.businessWorkspaceId ? "launched" : "drafting";
      } else if (action === "complete") {
        if (!next.conversion || next.conversion.idempotencyKey !== commandKey || next.conversion.actorId !== user) return { error: "conversion_locked" };
        if (next.conversion.businessWorkspaceId && next.conversion.businessWorkspaceId !== value) return { error: "conflict" };
        next.conversion.businessWorkspaceId = value; next.deliveryStatus = "launched";
      } else {
        if (workflow.status === "converted") return { error: "converted" };
        if (next.conversion) return { error: "conversion_locked" };
        next.deliveryStatus = action === "convert" ? "drafting" : value as DeliveryLead["deliveryStatus"];
      }
      if (action !== "note") next.statusUpdatedAt = now;
      workflow.status = stageToStatus[next.deliveryStatus]; workflow.updatedAt = now;
      const result = { lead: next, workflow, legacyOwnership: next.agencyWorkspaceId == null, idempotencyKey: commandKey };
      records.set(keys[0]!, next); records.set(keys[1]!, next); records.set(keys[2]!, workflow);
      records.set(keys[3]!, { fingerprint, result: structuredClone(result) });
      return result;
    }),
  };
  const seed = (lead: DeliveryLead) => { records.set(`lead-status:${lead.statusToken}`, lead); records.set(`lead:${lead.email}`, lead); members.push(`lead:${lead.email}`); };
  return { redis, records, seed };
}
let memory: ReturnType<typeof store>;
const command = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ agencyWorkspaceId: agency, expectedActorId: actorId, token, idempotencyKey: key, action: "status", status: "contacted", ...extra });
const post = (body = command(), headers: Record<string, string> = {}) => POST(new Request("https://app.example.test/api/agency/leads", { method: "POST", headers: { origin: "https://app.example.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const read = (id = agency, extra = "") => GET(new Request(`https://app.example.test/api/agency/leads?agencyWorkspaceId=${id}${extra}`));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "1"); vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", agency);
  mocks.actor.mockResolvedValue(actor); mocks.members.mockResolvedValue([member]); memory = store(); memory.seed(fixture({ agencyWorkspaceId: agency, requestType: "agency_service" })); mocks.redis.mockReturnValue(memory.redis);
  mocks.brand.mockResolvedValue({ agencyId: agency, name: "Strelva Agency" });
});
afterEach(() => vi.unstubAllEnvs());

describe("Strelva Agency's ordinary lead authority", () => {
  it("uses validated agency branding and refuses an outdated email projection as ownership proof", async () => {
    mocks.members.mockResolvedValue([{ ...member, name: "Strelva" }]);
    expect((await (await read()).json()).agency.name).toBe("Strelva Agency");
    memory.records.set(`lead-status:${token}`, fixture({ agencyWorkspaceId: other }));
    expect((await (await read()).json()).leads).toHaveLength(0);
  });
  it("lists explicit and legacy leads with retained ownership, excluding platform and foreign records", async () => {
    memory.seed(fixture({ statusToken: "b".repeat(36), email: "old@example.test" }));
    memory.seed(fixture({ statusToken: "c".repeat(36), email: "other@example.test", agencyWorkspaceId: other, requestType: "agency_service" }));
    for (const [i, requestType] of ["business_access", "agency_access", "", "unknown"].entries()) memory.seed(fixture({ statusToken: String(i + 1).repeat(36), email: `${i}@example.test`, requestType }));
    const response = await read(); const value = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(value.leads).toHaveLength(2); expect(value.leads[1].legacyOwnership).toBe(true); expect(value.leads[1].lead.agencyWorkspaceId).toBeUndefined();
    expect(value).toMatchObject({ currentActorId: actorId, conversionAvailable: true });
  });
  it("updates the canonical lifecycle, appends notes and replays without duplicating notes", async () => {
    expect((await post()).status).toBe(200);
    const note = command({ action: "note", status: undefined, note: " Called the owner. ", idempotencyKey: business });
    const first = await (await post(note)).json(); const second = await (await post(note)).json();
    expect(second).toEqual(first); expect(first.workflow).toMatchObject({ status: "contacted", note: "Called the owner.", notes: [{ createdBy: actorId, id: business }] });
    expect((await (await read()).json()).leads[0].lead.deliveryStatus).toBe("reviewing");
    expect(memory.redis.eval).toHaveBeenCalledWith(AGENCY_LEAD_COMMAND_SCRIPT, [`lead-status:${token}`, "lead:owner@bakery.example", `lead-workflow:${token}`, `lead-workflow:command:${agency}:${actorId}:${key}`], expect.any(Array));
    expect((await post({ ...note, note: "Different terms" })).status).toBe(409);
  });
  it("allows ordinary admins and legacy leads without silently assigning ownership", async () => {
    mocks.members.mockResolvedValue([{ ...member, role: "admin" }]); memory.seed(fixture({ statusToken: "b".repeat(36), email: "old@example.test" }));
    const result = await (await post(command({ token: "b".repeat(36), status: "dismissed" }))).json();
    expect(result.legacyOwnership).toBe(true); expect(result.workflow.status).toBe("dismissed"); expect(result.lead.agencyWorkspaceId).toBeUndefined();
  });
  it.each(["other_agency", "super_admin", "member", "no_config", "bad_config"])("refuses list, writes and conversion under %s", async mode => {
    const id = mode === "other_agency" ? other : agency;
    if (mode === "other_agency") mocks.members.mockResolvedValue([{ ...member, id: other }]);
    if (mode === "super_admin") { mocks.actor.mockResolvedValue({ ...actor, isSuperAdmin: true }); mocks.members.mockResolvedValue([]); }
    if (mode === "member") mocks.members.mockResolvedValue([{ ...member, role: "member" }]);
    if (mode === "no_config" || mode === "bad_config") vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", mode === "no_config" ? "" : "invalid");
    expect((await read(id)).status).toBe(403); expect((await post(command({ agencyWorkspaceId: id }))).status).toBe(403);
    await expect(beginAgencyLeadConversion(actor, id, token, key, {})).rejects.toThrow();
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("excludes and refuses platform requests even when forged with the configured agency id", async () => {
    memory.records.set(`lead-status:${token}`, fixture({ requestType: "business_access", agencyWorkspaceId: agency }));
    expect((await post()).status).toBe(403); await expect(readAgencyLead(actor, agency, token)).rejects.toThrow();
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("rechecks withdrawn owner/admin membership before any write", async () => {
    mocks.members.mockResolvedValueOnce([member]).mockResolvedValue([{ ...member, role: "member" }]);
    expect((await post()).status).toBe(403); expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("rechecks lead ownership inside the atomic provider command", async () => {
    const actual = memory.redis.eval.getMockImplementation()!;
    memory.redis.eval.mockImplementationOnce(async (script, keys, args) => {
      memory.records.set(`lead-status:${token}`, fixture({ agencyWorkspaceId: other }));
      return actual(script, keys, args);
    });
    expect((await post()).status).toBe(403); expect(memory.records.has(`lead-workflow:${token}`)).toBe(false);
  });
  it("uses membership-only navigation availability without reading private leads", async () => {
    expect(await (await read(agency, "&availability=1")).json()).toEqual({ available: true, agencyWorkspaceId: agency });
    expect(memory.redis.zrange).not.toHaveBeenCalled();
    mocks.members.mockResolvedValue([]); expect((await read(agency, "&availability=1")).status).toBe(403);
  });
  it("holds converted status until the ordinary add creates a business, and fences key/body/actor changes", async () => {
    const handoff = await (await post(command({ action: "convert", status: undefined }))).json();
    expect(handoff.workflow.status).toBe("converting"); expect(handoff.href).toBe(`/workspace/agency/clients/new?workspaceId=${agency}&leadToken=${token}`);
    const input = { action: "add", agencyWorkspaceId: agency, leadToken: token, idempotencyKey: business, name: "Bakery" };
    await beginAgencyLeadConversion(actor, agency, token, business, input);
    await expect(beginAgencyLeadConversion(actor, agency, token, key, { ...input, idempotencyKey: key })).rejects.toThrow("original request");
    await expect(beginAgencyLeadConversion(actor, agency, token, business, { ...input, name: "Changed" })).rejects.toThrow("different terms");
    await expect(completeAgencyLeadConversion({ ...actor, userId: other }, agency, token, business, other)).rejects.toThrow("original request");
    expect((await readAgencyLead(actor, agency, token)).workflow.status).toBe("converting");
    await completeAgencyLeadConversion(actor, agency, token, business, other);
    const current = await readAgencyLead(actor, agency, token);
    expect(current.workflow.status).toBe("converted"); expect(current.lead.conversion).toMatchObject({ actorId, businessWorkspaceId: other, input });
    expect((await post(command({ idempotencyKey: other, status: "new" }))).status).toBe(409);
    await completeAgencyLeadConversion(actor, agency, token, business, other);
  });
  it("recovers a provider command whose response was lost using the identical key", async () => {
    const actual = memory.redis.eval.getMockImplementation()!;
    memory.redis.eval.mockImplementationOnce(async (script, keys, args) => { await actual(script, keys, args); throw new Error("lost receipt"); });
    expect((await post()).status).toBe(503); expect((await post()).status).toBe(200);
    expect((await readAgencyLead(actor, agency, token)).workflow.status).toBe("contacted");
  });
  it.each([{ status: "converted" }, { action: "note", status: undefined, note: " " }, { action: "note", status: undefined, note: "x".repeat(2001) }, { token: "invalid" }, { createdBy: actorId }, { expectedActorId: other }])("refuses invalid or forged command %j", async fields => {
    expect([400, 403]).toContain((await post(command(fields))).status); expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("fails closed on storage, sign-in, release and conversion availability", async () => {
    mocks.redis.mockReturnValue(null); expect((await read()).status).toBe(503); expect((await post()).status).toBe(503);
    mocks.redis.mockReturnValue(memory.redis); mocks.actor.mockResolvedValue(null); expect((await post()).status).toBe(401);
    mocks.actor.mockResolvedValue(actor); vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "0"); expect((await (await read()).json()).conversionAvailable).toBe(false);
    expect((await post(command({ action: "convert", status: undefined }))).status).toBe(503);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect((await read()).status).toBe(503); expect((await post()).status).toBe(503);
  });
  it("rejects cross-site, non-JSON and oversized commands before mutation", async () => {
    expect((await post(command(), { origin: "https://other.example.test" })).status).toBe(403); expect(mocks.actor).not.toHaveBeenCalled();
    expect((await post(command(), { "content-type": "text/plain" })).status).toBe(415);
    expect((await post(command({ padding: "x".repeat(17000) }))).status).toBe(413); expect(memory.redis.eval).not.toHaveBeenCalled();
  });
});
