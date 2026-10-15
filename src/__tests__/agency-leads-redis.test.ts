import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import type { LeadWorkflow } from "@/platform/infra/lead-workflow-contracts";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.client }));
import { AGENCY_LEAD_COMMAND_SCRIPT, leadCommandFingerprint, persistAgencyLeadCommand } from "@/platform/infra/agency-leads";

// The October 12 lane cannot run sockets. This proof is deliberately opt-in
// for a coordinator with Redis binaries and permission for a disposable socket.
const execFileAsync = promisify(execFile);
const agency = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const business = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000004";
const key = "00000000-0000-4000-8000-000000000005";
const secondKey = "00000000-0000-4000-8000-000000000006";
const token = "a".repeat(36);
const email = "lead@fictional.example.test";
const statusKey = `lead-status:${token}`;
const emailKey = `lead:${email}`;
const workflowKey = `lead-workflow:${token}`;
let redis: IsolatedRedis | undefined;
const cli = (...args: string[]) => redis!.cli(...args);
type Command = Parameters<typeof persistAgencyLeadCommand>[0];

function command(overrides: Partial<Command> = {}) {
  const input = { agencyWorkspaceId: agency, actorId: actor, token, email, idempotencyKey: key,
    action: "note" as const, value: "First note", ...overrides };
  return persistAgencyLeadCommand({ ...input, fingerprint: overrides.fingerprint ?? leadCommandFingerprint({ action: input.action, value: input.value }) });
}
function seed(overrides: Partial<DeliveryLead> = {}, workflow: unknown = { token, status: "new", note: "Earlier note", notes: [], updatedAt: null }) {
  const lead: DeliveryLead = { businessName: "Fictional bakery", agencyWorkspaceId: agency, requestType: "agency_service",
    email, statusToken: token, deliveryStatus: "received", submittedAt: "2026-10-12T12:00:00.000Z", statusUpdatedAt: "2026-10-12T12:00:00.000Z", ...overrides };
  cli("SET", statusKey, JSON.stringify(lead), "EX", "3600");
  cli("SET", emailKey, JSON.stringify(lead), "EX", "5400");
  cli("SET", workflowKey, JSON.stringify(workflow), "EX", "7200");
}
function saved() {
  return { lead: JSON.parse(cli("GET", statusKey) as string) as DeliveryLead,
    projection: JSON.parse(cli("GET", emailKey) as string) as DeliveryLead,
    workflow: JSON.parse(cli("GET", workflowKey) as string) as LeadWorkflow };
}
function snapshot() {
  return (cli("KEYS", "*") as string[]).sort().map(name => [name, cli("GET", name)]);
}

describe.skipIf(process.env.STRELVA_AGENCY_LEADS_REDIS_PROOF !== "1" || !isolatedRedisAvailable)("agency leads atomic Lua contract (explicit isolated Redis proof)", () => {
  beforeAll(async () => {
    redis = await startIsolatedRedis("agency-leads-proof");
    const config = cli("CONFIG", "GET", "unixsocket") as Record<string, unknown> | unknown[];
    const socket = Array.isArray(config) ? config[config.indexOf("unixsocket") + 1] : config.unixsocket;
    if (typeof socket !== "string" || !socket) throw new Error("The isolated Redis Unix socket was not found.");
    // The helper's ordinary CLI is synchronous. Use separate asynchronous CLI
    // clients here so competing EVAL calls actually overlap at the transport.
    holder.client = { ...redis.client, eval: async (script: string, keys: string[], args: string[]) => {
      expect(script).toBe(AGENCY_LEAD_COMMAND_SCRIPT);
      const { stdout } = await execFileAsync("redis-cli", ["-s", socket, "--json", "EVAL", script, String(keys.length), ...keys, ...args.map(String)], { encoding: "utf8" });
      const value = JSON.parse(stdout) as unknown;
      if (typeof value === "string" && /^(WRONGTYPE|ERR)/.test(value)) throw new Error(value);
      return value;
    } };
  });
  afterAll(async () => { holder.client = null; if (redis) await redis.stop(); });
  beforeEach(() => { cli("FLUSHDB"); seed(); });

  it("replays concurrent same-key note callers once, preserving earlier notes", async () => {
    const [first, duplicate] = await Promise.all([command(), command()]);
    expect(first).toEqual(duplicate);
    const { lead, projection, workflow } = saved();
    expect(lead).toEqual(projection);
    expect(workflow.notes).toEqual([{ id: key, text: "First note", createdBy: actor, createdAt: expect.any(String) }]);
    expect(workflow.note).toBe("Earlier note\n\nFirst note");
    expect((cli("KEYS", "lead-workflow:command:*") as string[])).toHaveLength(1);
  });

  it("preserves both notes from concurrent distinct keys without lost updates", async () => {
    await Promise.all([command({ value: "First separate note" }), command({ idempotencyKey: secondKey, value: "Second separate note" })]);
    const { workflow } = saved();
    expect(workflow.notes).toHaveLength(2);
    expect(workflow.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: key, text: "First separate note" }),
      expect.objectContaining({ id: secondKey, text: "Second separate note" }),
    ]));
    expect(workflow.note).toContain("Earlier note"); expect(workflow.note).toContain("First separate note"); expect(workflow.note).toContain("Second separate note");
  });

  it("refuses a changed body under the same key without overwriting any record or receipt", async () => {
    await command(); const before = snapshot();
    expect(await command({ value: "Changed note" })).toEqual({ error: "conflict" });
    expect(snapshot()).toEqual(before);
  });

  it.each([
    { agencyWorkspaceId: other },
    { requestType: "platform_access" },
    { statusToken: "b".repeat(36) },
    { email: "someone-else@fictional.example.test" },
  ])("refuses foreign or platform ownership with zero writes (%j)", async overrides => {
    seed(overrides); const before = snapshot();
    expect(await command()).toEqual({ error: "access" });
    expect(snapshot()).toEqual(before);
  });

  it("supports historical sales leads while reporting their missing recorded agency ownership", async () => {
    seed({ agencyWorkspaceId: undefined, requestType: undefined });
    expect(await command({ allowLegacyOwnership: true })).toMatchObject({ legacyOwnership: true, lead: { statusToken: token } });
    expect(saved().lead.agencyWorkspaceId).toBeUndefined();
  });

  it("refuses unscoped history without the server-derived historical-owner allowance", async () => {
    seed({ agencyWorkspaceId: undefined, requestType: undefined }); const before = snapshot();
    expect(await command()).toEqual({ error: "access" }); expect(snapshot()).toEqual(before);
  });

  it("keeps the canonical lead, email projection and workflow in parity through every settable state and handoff", async () => {
    for (const [index, [deliveryStatus, status]] of [["reviewing", "contacted"], ["paused", "dismissed"], ["received", "new"]].entries()) {
      await command({ action: "status", value: deliveryStatus!, idempotencyKey: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}` });
      const state = saved(); expect(state.lead).toEqual(state.projection);
      expect(state.lead.deliveryStatus).toBe(deliveryStatus); expect(state.workflow.status).toBe(status);
      expect(state.lead.statusUpdatedAt).toBe(state.workflow.updatedAt);
    }
    await command({ action: "convert", value: "", idempotencyKey: secondKey });
    const state = saved(); expect(state.lead).toEqual(state.projection);
    expect(state.lead.deliveryStatus).toBe("drafting"); expect(state.workflow.status).toBe("converting");
    expect(state.lead.conversion).toBeUndefined();
  });

  it("binds conversion to the actor, key and exact body, retaining input for reload recovery", async () => {
    const input = { action: "add", agencyWorkspaceId: agency, leadToken: token, idempotencyKey: key, name: "Fictional bakery", ownerEmail: email };
    const begin = { action: "begin" as const, value: JSON.stringify(input), fingerprint: leadCommandFingerprint(input) };
    await command(begin); const before = snapshot();
    expect(saved().lead.conversion).toEqual({ actorId: actor, idempotencyKey: key, fingerprint: begin.fingerprint, input });
    expect(saved().lead.deliveryStatus).toBe("drafting"); expect(saved().workflow.status).toBe("converting");
    expect(await command({ ...begin, idempotencyKey: secondKey })).toEqual({ error: "conversion_locked" });
    expect(await command({ ...begin, actorId: other })).toEqual({ error: "conversion_locked" });
    expect(await command({ ...begin, value: JSON.stringify({ ...input, name: "Other name" }), fingerprint: "different" })).toEqual({ error: "conflict" });
    expect(snapshot()).toEqual(before);
    expect(await command(begin)).toMatchObject({ lead: { conversion: { input } }, workflow: { status: "converting" } });
  });

  it("marks converted only on explicit completion with the same actor and key, then replays the same business id", async () => {
    const input = { action: "add", agencyWorkspaceId: agency, leadToken: token, idempotencyKey: key, name: "Fictional bakery" };
    await command({ action: "begin", value: JSON.stringify(input), fingerprint: leadCommandFingerprint(input) });
    const before = snapshot();
    expect(await command({ action: "complete", value: business, idempotencyKey: secondKey })).toEqual({ error: "conversion_locked" });
    expect(await command({ action: "complete", value: business, actorId: other })).toEqual({ error: "conversion_locked" });
    expect(snapshot()).toEqual(before);
    const complete = { action: "complete" as const, value: business, fingerprint: leadCommandFingerprint({ token, businessWorkspaceId: business }) };
    const first = await command(complete); const replay = await command(complete); expect(replay).toEqual(first);
    const state = saved(); expect(state.lead).toEqual(state.projection);
    expect(state.lead.conversion?.businessWorkspaceId).toBe(business);
    expect(state.lead.deliveryStatus).toBe("launched"); expect(state.workflow.status).toBe("converted");
    const completed = snapshot();
    expect(await command({ ...complete, value: other, fingerprint: "changed-business" })).toEqual({ error: "conflict" });
    expect(snapshot()).toEqual(completed);
  });

  it("preserves existing TTLs on the lead, projection and workflow while expiring command receipts", async () => {
    const keys = [statusKey, emailKey, workflowKey];
    const before = keys.map(name => cli("PTTL", name) as number);
    await command();
    keys.forEach((name, index) => {
      const after = cli("PTTL", name) as number;
      expect(after).toBeGreaterThan(before[index]! - 10_000); expect(after).toBeLessThanOrEqual(before[index]!);
    });
    const receiptKey = (cli("KEYS", "lead-workflow:command:*") as string[])[0]!;
    expect(cli("TTL", receiptKey)).toBeGreaterThan(31_535_900);
  });

  it("fails syntactically malformed workflow before any write", async () => {
    cli("SET", workflowKey, "{", "EX", "7200"); const before = snapshot();
    await expect(command()).rejects.toThrow();
    expect(snapshot()).toEqual(before);
  });

  it.each([
    null, "broken workflow", [], { token: "b".repeat(36), status: "new" },
    { token, status: "new", note: 42 }, { token, status: "new", notes: "not notes" },
    { token, status: "new", notes: { arbitrary: { id: "old", text: "Old note" } } },
    { token, status: "new", notes: [{ id: "old", text: "Missing author and date" }] },
  ])("refuses a corrupt workflow token or type before any write (%j)", async workflow => {
    seed({}, workflow); const before = snapshot();
    expect(await command()).toEqual({ error: "corrupt" });
    expect(snapshot()).toEqual(before);
  });
});
