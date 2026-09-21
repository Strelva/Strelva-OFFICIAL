import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase Auth and database.");
test.setTimeout(120_000);

async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status);
  return status >= 400 ? null : response.json();
}

test("an exact-work personal AI token can read and propose, then revocation stops both", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "agent-access-owner");
  const otherOwner = await signedInContext(browser, admin, "agent-access-other-owner");
  try {
    const ownerWorkspaceResponse = await owner.context.request.get("/api/workspace");
    expect(ownerWorkspaceResponse.status(), await ownerWorkspaceResponse.text()).toBe(200);
    const { workspaceId } = await ownerWorkspaceResponse.json();
    const otherWorkspaceResponse = await otherOwner.context.request.get("/api/workspace");
    expect(otherWorkspaceResponse.status(), await otherWorkspaceResponse.text()).toBe(200);
    const { workspaceId: otherWorkspaceId } = await otherWorkspaceResponse.json();

    const document = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId,
      input: { title: "Opening procedure", text: "The business opens at nine." },
    });
    const otherDocument = await post(otherOwner.context.request, "/api/documents", {
      action: "create", workspaceId: otherWorkspaceId,
      input: { title: "Private supplier notes", text: "Other business data" },
    });

    const issued = await post(owner.context.request, "/api/agent-access", {
      kind: "issue",
      workId: document.workId,
      expectedRevision: 0,
      agentLabel: "Owner research assistant",
      purpose: "Suggest a clearer opening procedure",
      scopes: ["read", "propose"],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      budgetMinor: 100,
      currency: "USD",
    });
    expect(issued).toMatchObject({
      token: expect.stringMatching(/^sta_[A-Za-z0-9_-]{43}$/),
      integration: { workId: document.workId, agentLabel: "Owner research assistant", scopes: ["read", "propose"], authority: "issuing_user" },
    });
    const token = issued.token as string;
    const tokenId = issued.integration.id as string;
    const managed = await owner.context.request.get(`/api/agent-access?workId=${document.workId}`);
    expect(managed.status(), await managed.text()).toBe(200);
    const managedBody = await managed.json();
    expect(managedBody).toEqual([expect.objectContaining({ id: tokenId, workId: document.workId, tokenPrefix: token.slice(0, 12) })]);
    expect(JSON.stringify(managedBody)).not.toContain(token);
    expect(JSON.stringify(managedBody)).not.toContain("tokenHash");

    const read = await owner.context.request.get(`/api/agent-access/work/${document.workId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.status(), await read.text()).toBe(200);
    expect(await read.json()).toMatchObject({
      id: document.workId,
      title: "Opening procedure",
      revision: "0",
      payload: { text: "The business opens at nine." },
      integration: { tokenId, agentLabel: "Owner research assistant", authority: "issuing_user" },
    });

    const crossWorkspaceRead = await owner.context.request.get(`/api/agent-access/work/${otherDocument.workId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(crossWorkspaceRead.status(), await crossWorkspaceRead.text()).toBe(403);
    const crossWorkspaceProposal = await owner.context.request.post(`/api/agent-access/work/${otherDocument.workId}`, {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: {
        baseWorkRevision: "0", summary: "Must stay private", proposal: "Unauthorized change",
        evidence: [], costMinor: 0, idempotencyKey: "cross-workspace-denied",
      },
    });
    expect(crossWorkspaceProposal.status(), await crossWorkspaceProposal.text()).toBe(403);

    const proposalBody = {
      baseWorkRevision: "0",
      summary: "Clarify the first opening step",
      proposal: "Unlock the front door at nine, then check incoming requests.",
      evidence: [{ label: "Source", value: "The saved procedure says the business opens at nine." }],
      costMinor: 25,
      idempotencyKey: "opening-proposal-1",
    };
    const proposal = await owner.context.request.post(`/api/agent-access/work/${document.workId}`, {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: proposalBody,
    });
    expect(proposal.status(), await proposal.text()).toBe(200);
    expect(await proposal.json()).toMatchObject({ workId: document.workId, tokenId, status: "pending" });

    const unchanged = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect(unchanged.status(), await unchanged.text()).toBe(200);
    expect((await unchanged.json()).document).toMatchObject({ revision: 0, text: "The business opens at nine." });
    const otherUnchanged = await otherOwner.context.request.get(`/api/documents?workId=${otherDocument.workId}`);
    expect((await otherUnchanged.json()).document).toMatchObject({ revision: 0, text: "Other business data" });

    const participationResponse = await owner.context.request.get(`/api/work-participation?workId=${document.workId}`);
    expect(participationResponse.status(), await participationResponse.text()).toBe(200);
    const participation = await participationResponse.json();
    expect(participation.contributions).toEqual([
      expect.objectContaining({ summary: proposalBody.summary, status: "pending", costMinor: 25, actorId: owner.userId, sponsorId: owner.userId }),
    ]);

    await post(owner.context.request, "/api/agent-access", {
      kind: "revoke",
      workId: document.workId,
      expectedRevision: participation.revision,
      tokenId,
    });
    const deniedRead = await owner.context.request.get(`/api/agent-access/work/${document.workId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deniedRead.status(), await deniedRead.text()).toBe(403);
    const deniedProposal = await owner.context.request.post(`/api/agent-access/work/${document.workId}`, {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: { ...proposalBody, idempotencyKey: "after-revocation" },
    });
    expect(deniedProposal.status(), await deniedProposal.text()).toBe(403);
  } finally {
    await owner.context.close();
    await otherOwner.context.close();
  }
});
