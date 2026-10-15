import { beforeEach, describe, expect, it, vi } from "vitest";

const publishLinked = vi.hoisted(() => vi.fn());
const observeWorkRelease = vi.hoisted(() => vi.fn());

vi.mock("@/products/websites/index", () => ({ publishWebsiteRebuildOntoLinkedSite: publishLinked }));
vi.mock("@/products/websites/system-releases", () => ({ observeWebsiteWorkRelease: observeWorkRelease }));

import { publishWebsite, type WebsitePublishCommand } from "@/products/websites/publish";

const actor = { userId: "aaaaaaaa-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const WORKSPACE = "bbbbbbbb-0000-4000-8000-000000000001";
const WORK = "cccccccc-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  publishLinked.mockResolvedValue({ workId: WORK, workspaceId: WORKSPACE, rebuild: { status: "published" }, cutover: [] });
});

describe("publishWebsite", () => {
  it("has no tenant_sections variant: tenant sections publish through the tenant model (src/lib/publish-tenant-sections)", () => {
    // @ts-expect-error tenant_sections is not a way to publish through this workspace facade
    const command: WebsitePublishCommand = { via: "tenant_sections", input: {} };
    expect(command.via).toBe("tenant_sections");
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
