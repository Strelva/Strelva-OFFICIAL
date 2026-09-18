import { describe, expect, it } from "vitest";
import { createAgentAccessService, hashAgentAccessToken } from "@/platform/agent-access/service";
import type { AgentAccessRecord, AgentAccessStore } from "@/platform/agent-access/types";
import { createParticipationService } from "@/platform/work-participation/service";
import { createMemoryWorkAuthority } from "./support/work-authority";

const owner = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" };
const workId = "22222222-2222-4222-8222-222222222222";

function fixture(now = new Date("2026-09-15T12:00:00Z")) {
  const authority = createMemoryWorkAuthority(owner, { id: workId, workspaceId: "33333333-3333-4333-8333-333333333333", revision: "4", title: "Support procedure", payload: { text: "Escalate failures", apiKey: "never-return-this" } });
  const participation = createParticipationService(authority, () => now);
  const records = new Map<string, AgentAccessRecord>();
  const events = new Map<string, unknown>();
  let failNextEvent = false;
  const store: AgentAccessStore = {
    async issue({ actor, record, native }) {
      await authority.commit(actor, record.workId, "participation", native.expectedRevision, native.payload, "manage", native.expectedWorkRevision);
      records.set(record.id, structuredClone(record));
    },
    async revoke({ actor, record, native, revokedAt }) {
      await authority.commit(actor, record.workId, "participation", native.expectedRevision, native.payload, "manage", native.expectedWorkRevision);
      records.set(record.id, { ...record, revokedAt });
    },
    async managed(actor, requestedWorkId, tokenId) { const record = records.get(tokenId); return record?.issuer.userId === actor.userId && record.workId === requestedWorkId ? structuredClone(record) : null; },
    async list(actor, requestedWorkId) { return [...records.values()].filter(record => record.issuer.userId === actor.userId && record.workId === requestedWorkId).map(record => structuredClone(record)); },
    async resolve(hash, requestedWorkId) { return structuredClone([...records.values()].find(record => record.tokenHash === hash && record.workId === requestedWorkId) ?? null); },
    async recordEvent(event) {
      if (failNextEvent) { failNextEvent = false; throw new Error("event store unavailable"); }
      events.set(`${event.action}:${event.idempotencyKey || events.size}`, structuredClone(event));
    },
  };
  const service = createAgentAccessService({ authority, participation: { inspect: participation.inspect, readTarget: participation.readTarget, change: participation.change }, store, clock: () => now });
  return { authority, participation, records, events, service, failOneEvent: () => { failNextEvent = true; } };
}

async function issue(service: ReturnType<typeof fixture>["service"], scopes: Array<"read" | "propose"> = ["read", "propose"]) {
  const result = await service.manage(owner, { kind: "issue", workId, expectedRevision: 0, agentLabel: "Jacob's research assistant", purpose: "Review and propose a support procedure", scopes, expiresAt: "2026-09-16T12:00:00Z", budgetMinor: 500, currency: "USD" });
  if (!("token" in result) || !result.token) throw new Error("Expected an issued integration token.");
  return result as typeof result & { token: string };
}

describe("personal agent access", () => {
  it("stores only a token hash, rechecks native read authority, and redacts the returned target", async () => {
    const { service, records, events } = fixture();
    const issued = await issue(service);
    const record = [...records.values()][0]!;
    expect(issued.token).toMatch(/^sta_/);
    expect(record.tokenHash).toBe(hashAgentAccessToken(issued.token));
    expect(JSON.stringify(record)).not.toContain(issued.token);

    const target = await service.read(issued.token, workId);
    expect(target).toMatchObject({ id: workId, revision: "4", payload: { text: "Escalate failures", apiKey: "[redacted]" }, integration: { tokenId: record.id, agentLabel: "Jacob's research assistant" } });
    expect(events.size).toBe(1);
    await expect(service.read(issued.token, "44444444-4444-4444-8444-444444444444")).rejects.toThrow(/unavailable/i);
  });

  it("submits a server-attributed native pending proposal and keeps retries token-scoped", async () => {
    const { service, participation, records, events } = fixture();
    const issued = await issue(service);
    const record = [...records.values()][0]!;
    const proposal = { baseWorkRevision: "4", summary: "Add an escalation owner", proposal: "Name the on-call owner in the procedure.", evidence: [{ label: "Procedure", value: "Failures have no named owner. Password: never-store-this" }], costMinor: 100, idempotencyKey: "escalation-owner" };
    const first = await service.propose(issued.token, workId, proposal);
    const retry = await service.propose(issued.token, workId, proposal);
    expect(retry).toEqual(first);
    const state = await participation.read(owner, workId);
    expect(state.contributions).toHaveLength(1);
    const saved = state.contributions[0]!;
    expect(saved).toMatchObject({ actorId: owner.userId, grantId: record.grantId, idempotencyKey: `${record.id}:escalation-owner`, status: "pending" });
    const envelope = JSON.parse(saved.content);
    expect(envelope).toMatchObject({ kind: "agent_access_proposal", tokenId: record.id, agentLabel: "Jacob's research assistant" });
    expect(envelope.evidence[0].value).toContain("[redacted]");
    expect(saved.content).not.toContain("never-store-this");
    expect(events.size).toBe(1);
  });

  it("recovers an audit-write failure without duplicating an accepted native proposal", async () => {
    const { service, participation, failOneEvent, events } = fixture();
    const issued = await issue(service);
    const proposal = { baseWorkRevision: "4", summary: "Add owner", proposal: "Name the owner.", evidence: [], costMinor: 0, idempotencyKey: "audit-retry" };
    failOneEvent();
    await expect(service.propose(issued.token, workId, proposal)).rejects.toThrow(/event store unavailable/i);
    const recovered = await service.propose(issued.token, workId, proposal);
    expect(recovered.status).toBe("pending");
    expect((await participation.read(owner, workId)).contributions).toHaveLength(1);
    expect(events.size).toBe(1);
  });

  it("enforces token scope, expiry, revocation, and current issuer membership", async () => {
    const readOnly = fixture();
    const issued = await issue(readOnly.service, ["read"]);
    await expect(readOnly.service.propose(issued.token, workId, { baseWorkRevision: "4", summary: "Change", proposal: "Change it", evidence: [], costMinor: 0, idempotencyKey: "change" })).rejects.toThrow(/scope/i);
    const record = [...readOnly.records.values()][0]!;
    await readOnly.service.manage(owner, { kind: "revoke", workId, expectedRevision: 1, tokenId: record.id });
    await expect(readOnly.service.read(issued.token, workId)).rejects.toThrow(/unavailable|scope/i);

    const expired = fixture(new Date("2026-09-17T12:00:00Z"));
    const staleRecord = { ...record, revokedAt: null };
    expired.records.set(staleRecord.id, staleRecord);
    await expect(expired.service.read(issued.token, workId)).rejects.toThrow(/unavailable|scope/i);

    const membership = fixture();
    const live = await issue(membership.service);
    membership.authority.members.delete(owner.userId);
    await expect(membership.service.read(live.token, workId)).rejects.toThrow(/access/i);
  });
});
