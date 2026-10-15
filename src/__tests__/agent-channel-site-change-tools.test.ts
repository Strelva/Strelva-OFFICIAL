import { describe, expect, it, vi } from "vitest";
import { createAgentSiteChangeAdapter } from "@/products/websites/agent-site-changes";
import { siteRequestBrief, siteRequestNextStep, type SiteRequestRow } from "@/products/websites/site-change-brief";

const workspaceId = "81000000-0000-4000-8000-000000000001";
const agencyId = "81000000-0000-4000-8000-000000000002";
const userId = "81000000-0000-4000-8000-000000000003";
const requestId = "81000000-0000-4000-8000-000000000004";
const systemId = "81000000-0000-4000-8000-000000000005";
const FULL = "0123456789abcdef0123456789abcdef01234567";
const at = "2026-10-15T12:00:00Z";
const auth = { tokenHash: "a".repeat(64), resource: "https://app.strelva.com/api/mcp/public", workspaceId, userId, verifiedEmail: "staff@agency.example", agencyId };

const receipt = (kind: string, extra: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), kind, previewUrl: null, commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: at, ...extra });
const wire = (over: Record<string, unknown> = {}) => ({
  id: requestId, request: "Add a menu page", outcome: "A menu page", page: "Menu", accepted: "accepted", createdAt: at, receipts: [],
  systemId, tenantId: "client-site", siteName: "Client Site", repoUrl: "https://github.com/example/client", repoName: "client", productionDomain: "client.example", mayDeploy: true, ...over,
});

function harness(rows: Record<string, unknown>[], extra: { released?: boolean; ownerEmail?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    calls.push({ name, args });
    return name === "agent_list_website_change_requests" ? rows : receipt(String(args.p_kind), { reportedBy: "coding_agent" });
  });
  const verifyRelease = vi.fn(async () => ({ readBack: "confirmed" as const, revalidated: true, declaration: { reachable: true, contentSource: null, liveCommit: FULL } }));
  const observe = vi.fn(async () => {});
  const released = vi.fn(async () => extra.released ?? true);
  const service = createAgentSiteChangeAdapter({ rpc, released, verifyRelease, observe, ownerEmail: () => extra.ownerEmail ?? false, origin: "https://app.strelva.com" });
  return { service, rpc, calls, verifyRelease, observe, released };
}

describe("coding agent site Requests", () => {
  it("answers nothing while sites_by_code is off for the business", async () => {
    const h = harness([wire()], { released: false });
    await expect(h.service.call("list_site_requests", {}, auth)).rejects.toThrow("sites_by_code_off");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("lists open Requests with stage and next step, with the workspace identity", async () => {
    const h = harness([wire(), wire({ id: crypto.randomUUID(), receipts: [receipt("preview", { previewUrl: "https://p.example" }), receipt("approved"), receipt("deployed", { commitSha: FULL, deploymentUrl: "https://x.example", readBack: "confirmed" })] })]);
    const value = await h.service.call("list_site_requests", {}, auth) as { requests: { requestId: string; stage: string; nextStep: string }[] };
    expect(value.requests).toEqual([expect.objectContaining({ requestId, stage: "in_progress", nextStep: "build_and_report_preview" })]);
    expect(h.calls[0]).toEqual({ name: "agent_list_website_change_requests", args: { p_token_hash: auth.tokenHash, p_resource: auth.resource, p_workspace_id: workspaceId } });
    await expect(h.service.call("list_site_requests", { workspaceId }, auth)).rejects.toThrow();
  });

  it("reads one Request as a brief with the branch rule and the review link, and no secrets", async () => {
    const h = harness([wire()]);
    const value = await h.service.call("read_site_request", { requestId }, auth) as { brief: string; site: Record<string, unknown> };
    expect(value.brief).toContain(`strelva/${requestId.slice(0, 8)}`);
    expect(value.brief).toContain(`https://app.strelva.com/workspace/site?workspaceId=${workspaceId}&system=${systemId}&tab=request`);
    expect(value.brief).toContain("Never merge to production before the stage is approved.");
    expect(JSON.stringify(value)).not.toContain(auth.tokenHash);
    await expect(h.service.call("read_site_request", { requestId: crypto.randomUUID() }, auth)).rejects.toThrow("website_change_not_found");
  });

  it("records a preview with a lower-cased sha, ownerFacing defaulting to true, and says when owner email is off", async () => {
    const h = harness([wire()]);
    const value = await h.service.call("report_site_preview", { requestId, previewUrl: "https://menu.example.test", branch: "strelva/81000000", commitSha: FULL.toUpperCase(), summary: "A menu page" }, auth) as { ownerNotice: string; stage: string };
    expect(h.calls[0]!.name).toBe("agent_record_website_change");
    expect(h.calls[0]!.args).toMatchObject({ p_kind: "preview", p_request_id: requestId, p_details: { sourceCommitSha: FULL, ownerFacing: true, branch: "strelva/81000000" } });
    expect(value.stage).toBe("ready_for_review");
    expect(value.ownerNotice).toContain("Owner email is off");
    const on = harness([wire()], { ownerEmail: true });
    expect((await on.service.call("report_site_preview", { requestId, previewUrl: "https://menu.example.test", branch: "b", commitSha: FULL, summary: "x" }, auth) as { ownerNotice: string }).ownerNotice).toBe("The owner gets a Needs you notice.");
    for (const bad of [{ previewUrl: "http://menu.example.test" }, { branch: "bad branch" }, { commitSha: "nope" }]) {
      await expect(h.service.call("report_site_preview", { requestId, previewUrl: "https://menu.example.test", branch: "b", commitSha: FULL, summary: "x", ...bad }, auth)).rejects.toThrow();
    }
  });

  it("refuses a deploy before approval without refreshing the site or recording anything", async () => {
    const h = harness([wire({ receipts: [receipt("preview", { previewUrl: "https://p.example" })] })]);
    await expect(h.service.call("report_site_deploy", { requestId, commitSha: FULL, deploymentUrl: "https://x.example" }, auth)).rejects.toThrow("website_change_out_of_order");
    expect(h.verifyRelease).not.toHaveBeenCalled();
    expect(h.calls.map(call => call.name)).toEqual(["agent_list_website_change_requests"]);
  });

  it("records an approved deploy with Strelva's own read-back, and refuses an agent's", async () => {
    const h = harness([wire({ receipts: [receipt("preview", { previewUrl: "https://p.example" }), receipt("approved")] })]);
    const value = await h.service.call("report_site_deploy", { requestId, commitSha: FULL, deploymentUrl: "https://x.example.test", summary: "Menu is live" }, auth) as { readBack: string; release: string };
    expect(h.verifyRelease).toHaveBeenCalledWith("client-site", FULL);
    expect(h.calls.at(-1)!.args).toMatchObject({ p_kind: "deployed", p_details: { commitSha: FULL, readBack: "confirmed", summary: "Menu is live" } });
    expect(value).toMatchObject({ readBack: "confirmed", release: "recorded" });
    expect(h.observe).toHaveBeenCalledWith({ userId, verifiedEmail: "staff@agency.example" }, workspaceId, systemId);
    await expect(h.service.call("report_site_deploy", { requestId, commitSha: FULL, deploymentUrl: "https://x.example.test", readBack: "confirmed" }, auth)).rejects.toThrow();
  });
});

describe("owner releases", () => {
  const ownerAuth = { ...auth, agencyId: null, verifiedEmail: "owner@example.test" };
  const requestKey = "81000000-0000-4000-8000-000000000006";
  const release = { systemId, requestKey, commitSha: FULL.toUpperCase(), deploymentUrl: "https://client.example", summary: "New menu page" };

  it("finds the site, checks the live commit, records and observes, in that order", async () => {
    const order: string[] = [];
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>): Promise<unknown> => {
      order.push(name);
      return name === "agent_website_code_release_target" ? { tenantId: "client-site", tenantStableId: crypto.randomUUID() } : { id: crypto.randomUUID(), readBack: "confirmed" };
    });
    const verifyRelease = vi.fn(async () => { order.push("verify"); return { readBack: "confirmed" as const, revalidated: true, declaration: { reachable: true, contentSource: null, liveCommit: FULL } }; });
    const observe = vi.fn(async () => { order.push("observe"); });
    const service = createAgentSiteChangeAdapter({ rpc, released: async () => true, verifyRelease, observe, ownerEmail: () => false, origin: "https://app.strelva.com" });
    const value = await service.call("report_site_release", release, ownerAuth) as { readBack: string };
    expect(order).toEqual(["agent_website_code_release_target", "verify", "agent_record_website_code_release", "observe"]);
    expect(verifyRelease).toHaveBeenCalledWith("client-site", FULL.toUpperCase());
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_system_id: systemId, p_request_key: requestKey, p_commit_sha: FULL, p_read_back: "confirmed", p_summary: "New menu page" });
    expect(observe).toHaveBeenCalledWith({ userId, verifiedEmail: "owner@example.test" }, workspaceId, systemId);
    expect(value.readBack).toBe("confirmed");
  });

  it("refuses an agency principal before any database call, and an agent-chosen read-back", async () => {
    const h = harness([wire()]);
    await expect(h.service.call("report_site_release", release, auth)).rejects.toThrow("website_change_operator_required");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.verifyRelease).not.toHaveBeenCalled();
    await expect(h.service.call("report_site_release", { ...release, readBack: "confirmed" }, ownerAuth)).rejects.toThrow();
    await expect(h.service.call("report_site_release", { ...release, requestKey: "not-a-uuid" }, ownerAuth)).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("site Request brief", () => {
  const row = (over: Record<string, unknown> = {}): SiteRequestRow => ({ ...(wire(over) as unknown as SiteRequestRow), status: "requested", updatedAt: at });
  it("tells the agent the next step from the stage, acceptance and publish permission", () => {
    expect(siteRequestNextStep(row({ accepted: "pending" }))).toBe("wait_for_agency_acceptance");
    expect(siteRequestNextStep(row())).toBe("build_and_report_preview");
    expect(siteRequestNextStep(row({ receipts: [receipt("preview")] }))).toBe("wait_for_owner");
    expect(siteRequestNextStep(row({ receipts: [receipt("preview"), receipt("approved")] }))).toBe("merge_deploy_and_report");
    expect(siteRequestNextStep(row({ mayDeploy: false, receipts: [receipt("preview"), receipt("approved")] }))).toBe("wait_for_agency_acceptance");
    expect(siteRequestNextStep(row({ receipts: [receipt("preview"), receipt("declined")] }))).toBe("build_and_report_preview");
    expect(siteRequestBrief(row({ mayDeploy: false, receipts: [receipt("preview"), receipt("approved")] }), { origin: "https://app.strelva.com", workspaceId })).toContain("does not hold publish permission");
  });
});
