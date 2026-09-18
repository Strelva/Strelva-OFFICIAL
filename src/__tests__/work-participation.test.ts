import { describe, expect, it } from "vitest";
import { createParticipationService } from "@/platform/work-participation/service";
import { createMemoryWorkAuthority } from "./support/work-authority";

const owner = { userId: "owner", verifiedEmail: "owner@example.com" };
const guest = { userId: "guest", verifiedEmail: "guest@example.com" };

describe("bounded work participation", () => {
  it("lets a sponsored person propose work, retains attribution on review, and stops new contributions after revocation", async () => {
    const authority = createMemoryWorkAuthority(owner, { id: "work", workspaceId: "workspace", revision: "1", title: "Procedure", payload: { text: "Original" } });
    const service = createParticipationService(authority, () => new Date("2026-09-12T12:00:00Z"));
    const granted = await service.change(owner, "work", { kind: "grant", expectedRevision: 0, participantEmail: guest.verifiedEmail, participantKind: "person", scope: ["propose"], purpose: "Correct the procedure", expiresAt: "2026-09-13T12:00:00Z", budgetMinor: 500, currency: "USD" });
    const grant = granted.grants[0]!;
    const proposed = await service.change(guest, "work", { kind: "contribute", expectedRevision: 1, grantId: grant.id, baseWorkRevision: "1", summary: "Corrected opening hours", content: "Open at nine", costMinor: 100, idempotencyKey: "hours" });
    expect(proposed.contributions[0]).toMatchObject({ actorId: "guest", sponsorId: "owner", status: "pending", costMinor: 100 });
    const reviewed = await service.change(owner, "work", { kind: "review", expectedRevision: 2, contributionId: proposed.contributions[0]!.id, decision: "accept", reason: "Matches the business hours" });
    expect(reviewed.contributions[0]).toMatchObject({ status: "accepted", reviewedBy: "owner" });
    expect(authority.work.payload).toEqual({ text: "Original" });
    await service.change(owner, "work", { kind: "revoke", expectedRevision: 3, grantId: grant.id });
    await expect(service.change(guest, "work", { kind: "contribute", expectedRevision: 4, grantId: grant.id, baseWorkRevision: "1", summary: "Another change", content: "Changed", costMinor: 0, idempotencyKey: "next" })).rejects.toThrow(/access|grant/i);
  });
});

it("blocks stale acceptance, unknown costs, excess costs, and replays changed proposals", async () => {
  const authority = createMemoryWorkAuthority(owner, { id: "work", workspaceId: "workspace", revision: "1", title: "Procedure", payload: {} });
  const service = createParticipationService(authority, () => new Date("2026-09-12T12:00:00Z"));
  const granted = await service.change(owner, "work", { kind: "grant", expectedRevision: 0, participantEmail: guest.verifiedEmail, participantKind: "agent", scope: ["propose"], purpose: "Check hours", expiresAt: "2026-09-13T12:00:00Z", budgetMinor: 200, currency: "USD" });
  const command = { kind: "contribute", expectedRevision: 1, grantId: granted.grants[0]!.id, baseWorkRevision: "1", summary: "Hours", content: "Nine", costMinor: 100, idempotencyKey: "hours" };
  await expect(service.change(guest, "work", { ...command, costMinor: null })).rejects.toThrow(/cost/i);
  await expect(service.change(guest, "work", { ...command, costMinor: 201 })).rejects.toThrow(/cost/i);
  const saved = await service.change(guest, "work", command);
  expect(await service.change(guest, "work", command)).toEqual(saved);
  await expect(service.change(guest, "work", { ...command, content: "Ten" })).rejects.toThrow(/retry key/i);
  authority.work.revision = "2";
  await expect(service.change(owner, "work", { kind: "review", expectedRevision: 2, contributionId: saved.contributions[0]!.id, decision: "accept", reason: "Looks good" })).rejects.toThrow(/work changed/i);
  const rejected = await service.change(owner, "work", { kind: "review", expectedRevision: 2, contributionId: saved.contributions[0]!.id, decision: "reject", reason: "Revise against the current procedure" });
  expect(rejected.contributions[0]!.status).toBe("rejected");
});

it("does not let delegated people read the artifact or create broader grants without permission", async () => {
  const authority = createMemoryWorkAuthority(owner, { id: "work", workspaceId: "workspace", revision: "1", title: "Private", payload: { secret: "private business text" } });
  const service = createParticipationService(authority, () => new Date("2026-09-12T12:00:00Z"));
  const command = { kind: "grant", expectedRevision: 0, participantEmail: guest.verifiedEmail, participantKind: "person", scope: ["propose"], purpose: "Propose hours", expiresAt: "2026-09-13T12:00:00Z", budgetMinor: 0, currency: "USD" };
  await service.change(owner, "work", command);
  await expect(service.readTarget(guest, "work")).rejects.toThrow(/does not include reading/i);
  await expect(service.change(guest, "work", { ...command, expectedRevision: 1 })).rejects.toThrow(/owner or administrator/i);
  await expect(service.read({ userId: "stranger", verifiedEmail: "stranger@example.com" }, "work")).rejects.toThrow(/grant/i);
});
