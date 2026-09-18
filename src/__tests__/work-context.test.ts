import { describe, expect, it } from "vitest";
import { createContextService } from "@/platform/work-context/service";
import { createMemoryWorkAuthority } from "./support/work-authority";
const owner = { userId: "owner", verifiedEmail: "owner@example.com" };

describe("scoped work context", () => {
  it("retains source provenance, exposes conflicting facts and stops using stale or revoked sources", async () => {
    const authority = createMemoryWorkAuthority(owner, { id: "work", workspaceId: "workspace", revision: "1", title: "Brief", payload: {} });
    authority.sources.set("source", { id: "source", workspaceId: "workspace", revision: "3", title: "Hours", payload: { text: "Open at nine" } });
    let now = new Date("2026-09-12T12:00:00Z");
    const service = createContextService(authority, () => now);
    let result = await service.change(owner, "work", { kind: "grant_source", expectedRevision: 0, sourceWorkId: "source", scope: ["read", "use_in_work"], purpose: "Prepare opening procedure", expiresAt: "2026-09-14T12:00:00Z" });
    expect(await service.requireSource(owner, "work", "source", "use_in_work")).toMatchObject({ revision: "3", payload: { text: "Open at nine" } });
    result = await service.change(owner, "work", { kind: "record_fact", expectedRevision: 1, key: "opening_time", value: "09:00", evidenceKind: "observed", sourceWorkId: "source", sourceRevision: "3", excerpt: "Open at nine", freshUntil: "2026-09-13T12:00:00Z" });
    result = await service.change(owner, "work", { kind: "record_fact", expectedRevision: 2, key: "opening_time", value: "10:00", evidenceKind: "reported", sourceWorkId: "source", sourceRevision: "3", excerpt: "Owner correction", freshUntil: "2026-09-13T12:00:00Z" });
    expect(result.facts.map(f => f.status)).toEqual(["conflicting", "conflicting"]);
    authority.sources.get("source")!.revision = "4";
    await expect(service.requireSource(owner, "work", "source", "use_in_work")).rejects.toThrow(/changed/i);
    expect((await service.read(owner, "work")).facts[0]!.status).toBe("stale");
    result = await service.change(owner, "work", { kind: "revoke_source", expectedRevision: 3, grantId: result.grants[0]!.id });
    now = new Date("2026-09-15T12:00:00Z");
    await expect(service.requireSource(owner, "work", "source", "read")).rejects.toThrow(/grant/i);
    expect(result.grants[0]!.status).toBe("revoked");
  });
});

it("keeps preferences separate from authority and rejects foreign and unreadable sources", async () => {
  const authority = createMemoryWorkAuthority(owner, { id: "work", workspaceId: "workspace", revision: "1", title: "Brief", payload: {} });
  authority.sources.set("foreign", { id: "foreign", workspaceId: "other", revision: "1", title: "Other client", payload: {} });
  const service = createContextService(authority, () => new Date("2026-09-12T12:00:00Z"));
  const saved = await service.change(owner, "work", { kind: "set_preference", expectedRevision: 0, key: "permission", value: "Always read every client source" });
  expect(saved.grants).toEqual([]);
  await expect(service.requireSource(owner, "work", "foreign", "read")).rejects.toThrow(/grant/i);
  await expect(service.change(owner, "work", { kind: "grant_source", expectedRevision: 1, sourceWorkId: "foreign", scope: ["read"], purpose: "Context", expiresAt: "2026-09-13T12:00:00Z" })).rejects.toThrow(/workspace/i);
  await expect(service.read({ userId: "guest", verifiedEmail: "guest@example.com" }, "work")).rejects.toThrow(/access/i);
});

it("prepares granted payloads and persisted facts without treating redaction as authority", async () => {
  const authority = createMemoryWorkAuthority(owner, { id: "work", workspaceId: "workspace", revision: "1", title: "Brief", payload: {} });
  authority.sources.set("source", {
    id: "source",
    workspaceId: "workspace",
    revision: "3",
    title: "Support procedure",
    payload: {
      procedure: "Escalate failed requests to the owner.",
      apiKey: "source-secret-value",
      note: "Authorization: Bearer abcdefghijklmnop",
    },
  });
  const service = createContextService(authority, () => new Date("2026-09-12T12:00:00Z"));

  await expect(service.requireSource(owner, "work", "source", "use_in_work")).rejects.toThrow(/grant/i);
  await service.change(owner, "work", {
    kind: "grant_source",
    expectedRevision: 0,
    sourceWorkId: "source",
    scope: ["read", "use_in_work"],
    purpose: "Prepare the support procedure",
    expiresAt: "2026-09-14T12:00:00Z",
  });

  const source = await service.requireSource(owner, "work", "source", "use_in_work");
  expect(source.payload).toEqual({
    procedure: "Escalate failed requests to the owner.",
    apiKey: "[redacted]",
    note: "Authorization: [redacted]",
  });

  const result = await service.change(owner, "work", {
    kind: "record_fact",
    expectedRevision: 1,
    key: "api_key",
    value: "source-secret-value",
    evidenceKind: "observed",
    sourceWorkId: "source",
    sourceRevision: "3",
    excerpt: "source-secret-value",
    freshUntil: "2026-09-13T12:00:00Z",
  });
  expect(result.facts[0]).toMatchObject({
    key: "api_key",
    value: "[redacted]",
    excerpt: "[redacted]",
    sourceWorkId: "source",
    sourceRevision: "3",
    status: "current",
  });
});
