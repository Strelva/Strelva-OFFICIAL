import { beforeEach, describe, expect, it, vi } from "vitest";

const publishTenantSections = vi.hoisted(() => vi.fn());
const publishLinked = vi.hoisted(() => vi.fn());
const observeWorkRelease = vi.hoisted(() => vi.fn());
vi.mock("@/products/websites/publish/tenant-sections", () => ({
  publishTenantSections,
  isSectionWriteFailure: () => false,
  writeTenantSections: vi.fn(),
}));
vi.mock("@/products/websites/index", () => ({ publishWebsiteRebuildOntoLinkedSite: publishLinked }));
vi.mock("@/products/websites/system-releases", () => ({ observeWebsiteWorkRelease: observeWorkRelease }));

import { publishWebsite, type WebsitePublishCommand } from "@/products/websites/publish";

const actor = { userId: "aaaaaaaa-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const WORKSPACE = "bbbbbbbb-0000-4000-8000-000000000001";
const WORK = "cccccccc-0000-4000-8000-000000000001";
const sections = { tenantId: "tenant-a", writes: [{ section: "hero" as const, data: { title: "New" } as never }], author: "user" as const, versions: "strict" as const, clearDrafts: "none" as const };

beforeEach(() => {
  vi.clearAllMocks();
  publishTenantSections.mockResolvedValue({ status: "published", sections: ["hero"], pageConfig: false, revalidation: Promise.resolve() });
  publishLinked.mockResolvedValue({ workId: WORK, workspaceId: WORKSPACE, rebuild: { status: "published" }, cutover: [] });
});

describe("publishWebsite", () => {
  it("tenant_sections hands its input to the section publisher untouched and returns its receipt as the detail", async () => {
    const outcome = await publishWebsite({ via: "tenant_sections", input: sections });
    expect(publishTenantSections).toHaveBeenCalledWith(sections);
    expect(outcome.via).toBe("tenant_sections");
    expect(outcome.releaseObserved).toBe("recorded");
    expect(outcome.detail).toBe(await publishTenantSections.mock.results[0]!.value);
  });

  it("a section publish another caller already took records no Release", async () => {
    publishTenantSections.mockResolvedValue({ status: "already_resolved" });
    expect(await publishWebsite({ via: "tenant_sections", input: sections })).toEqual({ via: "tenant_sections", releaseObserved: "not_applicable", detail: { status: "already_resolved" } });
  });

  it("site_document publishes the rebuild with the caller's exact arguments and returns the same detail", async () => {
    const input = { expectedRevision: 2, candidateRevision: 2, candidateContentHash: "a".repeat(64), tenantId: "tenant-a" };
    const outcome = await publishWebsite({ via: "site_document", actor, workId: WORK, input });
    expect(publishLinked).toHaveBeenCalledTimes(1);
    expect(publishLinked).toHaveBeenCalledWith(actor, WORK, input);
    expect(outcome.detail).toBe(await publishLinked.mock.results[0]!.value);
    expect(outcome).toMatchObject({ via: "site_document", releaseObserved: "recorded" });
  });

  it("site_document observes the website Release once, for the business the rebuild belongs to", async () => {
    await publishWebsite({ via: "site_document", actor, workId: WORK, input: {} });
    expect(observeWorkRelease).toHaveBeenCalledTimes(1);
    expect(observeWorkRelease).toHaveBeenCalledWith(actor, WORKSPACE, WORK);
  });

  it("a rebuild that fails to publish records nothing", async () => {
    publishLinked.mockRejectedValue(new Error("not approved"));
    await expect(publishWebsite({ via: "site_document", actor, workId: WORK, input: {} })).rejects.toThrow("not approved");
    expect(observeWorkRelease).not.toHaveBeenCalled();
  });

  it("has no repo-deploy variant: a coding agent's commit is recorded by the site-changes store", () => {
    // @ts-expect-error repo_deploy is not a way to publish through this facade
    const command: WebsitePublishCommand = { via: "repo_deploy", actor, workspaceId: WORKSPACE, requestId: "r1", step: { kind: "deployed" } };
    expect(command.via).toBe("repo_deploy");
  });
});
