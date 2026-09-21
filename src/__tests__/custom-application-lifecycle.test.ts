import { describe, expect, it, vi } from "vitest";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import type { SavedWork, WorkspaceActor } from "@/platform/workspaces/types";
import {
  createCustomApplicationService,
  customApplicationSourceDigest,
  type CustomBuildAdmission,
} from "@/products/custom-applications/server";
import { customArtifactDigest, validateCustomBuild, type CustomApplicationArtifact, type CustomBuildInput } from "@/products/custom-applications/build";

const owner: WorkspaceActor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  verifiedEmail: "owner@example.com",
};
const recipient: WorkspaceActor = {
  userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  verifiedEmail: "recipient@example.com",
};
const workspaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const jobId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const files = { "build.mjs": "import { writeFile } from 'node:fs/promises'; await writeFile('/output/index.html', '<main>v1</main>');" };

function store(createdIds: string[] = []): BoundedStore {
  const rows = new Map<string, SavedWork>();
  return {
    async member(actor, workspace) {
      if (workspace !== workspaceId || ![owner.userId].includes(actor.userId)) throw new Error("Workspace access denied");
    },
    async read(_actor, id) { return rows.has(id) ? structuredClone(rows.get(id)!) : null; },
    async create(actor, workspace, input) {
      const row: SavedWork = { ...input, id: crypto.randomUUID(), workspaceId: workspace, createdBy: actor.userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      rows.set(row.id, structuredClone(row));
      createdIds.push(row.id);
      return structuredClone(row);
    },
    async update(_actor, work, expectedRevision, payload) {
      const current = rows.get(work.id)!;
      if ((current.payload as { revision: number }).revision !== expectedRevision) throw new Error("revision conflict");
      const next = { ...current, payload, updatedAt: new Date().toISOString() };
      rows.set(work.id, structuredClone(next));
      return structuredClone(next);
    },
  };
}

function economics(): CustomBuildAdmission {
  const receipts = new Map<string, unknown>();
  return {
    async ensureBudget(_actor, _target, budget) {
      return { jobId, maxAuthorizedCents: budget.maxAuthorizedCents, estimateCents: budget.estimateCents, status: "accepted" };
    },
    async execute<T>(_actor: WorkspaceActor, target: Parameters<CustomBuildAdmission["execute"]>[1], perform: () => Promise<T>): Promise<{ disposition: "performed" | "replayed"; value?: T }> {
      if (receipts.has(`${target.jobId}:${target.version}`)) return { disposition: "replayed", value: receipts.get(`${target.jobId}:${target.version}`) as T };
      const value = await perform();
      receipts.set(`${target.jobId}:${target.version}`, value);
      return { disposition: "performed", value };
    },
  };
}

function artifact(workspace: string, resource: string, version: number, html: string, inputFiles: Record<string, string> = files): CustomApplicationArtifact {
  const sourceDigest = customApplicationSourceDigest(inputFiles);
  return {
    version: 1,
    workspaceId: workspace,
    resourceId: resource,
    applicationVersion: version,
    sourceDigest,
    artifactDigest: customArtifactDigest({ workspaceId: workspace, resourceId: resource, applicationVersion: version, html }),
    image: "node@sha256:test",
    html,
    builtAt: new Date().toISOString(),
    durationMs: 4,
    state: "built",
    limits: { network: "none", memoryMb: 256, cpuCount: 1, timeoutSeconds: 30 },
  };
}

const checks = [
  { id: "build" as const, passed: true as const, evidence: "isolated build receipt" },
  { id: "desktop" as const, passed: true as const, evidence: "1280px local render" },
  { id: "mobile" as const, passed: true as const, evidence: "360px local render" },
  { id: "keyboard" as const, passed: true as const, evidence: "tab order checked" },
];

describe("custom application lifecycle", () => {
  it("keeps a reviewed release live while a candidate changes, then rolls back without losing recipient access", async () => {
    const build = vi.fn(async (raw: unknown) => {
      const input: CustomBuildInput = validateCustomBuild(raw);
      const html = input.applicationVersion === 1 ? "<main>v1</main>" : "<main>v2</main>";
      return artifact(input.workspaceId, input.resourceId, input.applicationVersion, html, input.files);
    });
    const service = createCustomApplicationService(store(), { build, economics: economics() });
    const app = await service.create(owner, workspaceId, { title: "Shift handoff", files, budget: { maxAuthorizedCents: 0, estimateCents: 0 } });
    expect(app.status).toBe("draft");
    await expect(service.build(owner, app.workId, { expectedCandidateRevision: app.candidate.revision })).resolves.toMatchObject({ candidate: { artifact: { artifactDigest: expect.any(String), review: null } } });
    const built = await service.read(owner, app.workId);
    await expect(service.release(owner, app.workId, { expectedCandidateRevision: built.candidate.revision, expectedReleaseVersion: null })).rejects.toThrow(/reviewed build/i);
    const reviewed = await service.review(owner, app.workId, { expectedCandidateRevision: built.candidate.revision, artifactDigest: built.candidate.artifact!.artifactDigest, checks });
    const released = await service.release(owner, app.workId, { expectedCandidateRevision: reviewed.candidate.revision, expectedReleaseVersion: null });
    const grant = await service.grant(owner, app.workId, { recipientEmail: recipient.verifiedEmail, purpose: "Submit shifts", expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(grant.releaseVersion).toBe(released.currentReleaseVersion);
    expect(await service.use(recipient, app.workId)).toMatchObject({ releaseVersion: 1, html: "<main>v1</main>" });

    const revised = await service.revise(owner, app.workId, { expectedCandidateRevision: released.candidate.revision, title: "Shift handoff v2", files: { ...files, "build.mjs": "import { writeFile } from 'node:fs/promises'; await writeFile('/output/index.html', '<main>v2</main>');" } });
    await service.build(owner, app.workId, { expectedCandidateRevision: revised.candidate.revision });
    const v2Built = await service.read(owner, app.workId);
    const v2Reviewed = await service.review(owner, app.workId, { expectedCandidateRevision: v2Built.candidate.revision, artifactDigest: v2Built.candidate.artifact!.artifactDigest, checks });
    const v2Released = await service.release(owner, app.workId, { expectedCandidateRevision: v2Reviewed.candidate.revision, expectedReleaseVersion: released.currentReleaseVersion });
    expect(v2Released.currentReleaseVersion).toBe(2);
    expect(await service.use(recipient, app.workId)).toMatchObject({ releaseVersion: 1, html: "<main>v1</main>" });
    const rolledBack = await service.rollback(owner, app.workId, { expectedReleaseVersion: v2Released.currentReleaseVersion, version: 1 });
    expect(rolledBack.currentReleaseVersion).toBe(1);
    expect(await service.use(recipient, app.workId)).toMatchObject({ releaseVersion: 1, html: "<main>v1</main>" });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("retains drafts on denied, stale, unreviewed, expired, and revoked paths", async () => {
    const service = createCustomApplicationService(store(), { build: async (raw: unknown) => {
      const input: CustomBuildInput = validateCustomBuild(raw);
      return artifact(input.workspaceId, input.resourceId, input.applicationVersion, "<main>ok</main>", input.files);
    }, economics: economics() });
    const app = await service.create(owner, workspaceId, { title: "Review queue", files, budget: { maxAuthorizedCents: 0, estimateCents: null } });
    await expect(service.use(recipient, app.workId)).rejects.toThrow(/available/i);
    await expect(service.build(owner, app.workId, { expectedCandidateRevision: 2 })).rejects.toThrow(/changed/i);
    await expect(service.release(owner, app.workId, { expectedCandidateRevision: 0, expectedReleaseVersion: null })).rejects.toThrow(/reviewed build/i);
    await service.build(owner, app.workId, { expectedCandidateRevision: 0 });
    const built = await service.read(owner, app.workId);
    await service.review(owner, app.workId, { expectedCandidateRevision: 0, artifactDigest: built.candidate.artifact!.artifactDigest, checks });
    await service.release(owner, app.workId, { expectedCandidateRevision: 0, expectedReleaseVersion: null });
    const expired = await service.grant(owner, app.workId, { recipientEmail: recipient.verifiedEmail, purpose: "Expired", expiresAt: "2020-01-01T00:00:00.000Z" }).catch(error => error);
    expect(expired).toMatchObject({ name: "CustomApplicationConflictError" });
    const grant = await service.grant(owner, app.workId, { recipientEmail: recipient.verifiedEmail, purpose: "Temporary", expiresAt: "2099-01-01T00:00:00.000Z" });
    await service.revoke(owner, app.workId, grant.id);
    await expect(service.use(recipient, app.workId)).rejects.toThrow(/available/i);
  });

  it("keeps a saved draft resumable when the first budget admission fails", async () => {
    const createdIds: string[] = [];
    let failAdmission = true;
    const admission = economics();
    const flakyEconomics: CustomBuildAdmission = {
      ...admission,
      async ensureBudget(actor, target, budget) {
        if (failAdmission) throw new Error("local admission unavailable");
        return admission.ensureBudget(actor, target, budget);
      },
    };
    const service = createCustomApplicationService(store(createdIds), {
      economics: flakyEconomics,
      build: async (raw: unknown) => {
        const input: CustomBuildInput = validateCustomBuild(raw);
        return artifact(input.workspaceId, input.resourceId, input.applicationVersion, "<main>resumed</main>", input.files);
      },
    });
    const budget = { maxAuthorizedCents: 25, estimateCents: 10 };
    const failed = await service.create(owner, workspaceId, { title: "Resumable local tool", files, budget }).catch(error => error);
    expect(failed).toMatchObject({ name: "CustomApplicationBudgetRecoveryError", workId: expect.any(String) });
    expect(createdIds).toHaveLength(1);
    await expect(service.read(owner, failed.workId)).resolves.toMatchObject({ workId: failed.workId, status: "draft", budget: null });

    failAdmission = false;
    const resumed = await service.admitBudget(owner, failed.workId, budget);
    expect(resumed.budget).toMatchObject({ maxAuthorizedCents: 25, estimateCents: 10, status: "accepted" });
    expect(createdIds).toHaveLength(1);
  });
});
