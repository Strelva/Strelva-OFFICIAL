import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires a separately created, isolated local Supabase stack.");
test.setTimeout(120_000);

async function postWorkspace(request: APIRequestContext, origin: string, body: Record<string, unknown>) {
  return request.post("/api/workspace", {
    data: body,
    headers: { origin },
  });
}

async function postTracker(request: APIRequestContext, origin: string, body: Record<string, unknown>) {
  return request.post("/api/tracker", {
    data: body,
    headers: { origin },
  });
}

test("real local auth preserves tracker handoff, delegated read, and customer revocation", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "handoff-owner");
  const customer = await signedInContext(browser, admin, "handoff-customer");
  const wrongRecipient = await signedInContext(browser, admin, "handoff-wrong-recipient");

  let agencyWorkspaceId = "";
  let sourceWorkId = "";
  let customerWorkspaceId = "";
  let customerWorkId = "";
  let delegationId = "";

  try {
    const agencyResponse = await postWorkspace(owner.context.request, env.app, {
      action: "create_agency",
      name: "Local handoff verification team",
    });
    expect(agencyResponse.status()).toBe(201);
    const agencyBody = await agencyResponse.json() as { workspaceId?: unknown };
    expect(typeof agencyBody.workspaceId).toBe("string");
    agencyWorkspaceId = agencyBody.workspaceId as string;

    const trackerResponse = await postTracker(owner.context.request, env.app, {
      action: "create",
      workspaceId: agencyWorkspaceId,
      title: "Local handoff tracker",
      input: {
        fileName: "handoff-requests.csv",
        mimeType: "text/csv",
        content: "Request,Status\nFirst inquiry,Waiting\nSecond inquiry,Assigned",
      },
    });
    expect(trackerResponse.status()).toBe(200);
    const trackerBody = await trackerResponse.json() as { workId?: unknown; workspaceId?: unknown; tracker?: { id?: unknown; revision?: unknown; rows?: unknown[] } };
    expect(typeof trackerBody.workId).toBe("string");
    expect(trackerBody.workspaceId).toBe(agencyWorkspaceId);
    expect(trackerBody.tracker?.id).toEqual(expect.any(String));
    expect(trackerBody.tracker?.revision).toBe(0);
    expect(trackerBody.tracker?.rows).toHaveLength(2);
    sourceWorkId = trackerBody.workId as string;

    const sourceRead = await owner.context.request.get(`/api/tracker?workId=${sourceWorkId}`);
    expect(sourceRead.status()).toBe(200);
    expect((await sourceRead.json()).tracker.revision).toBe(0);

    const handoffResponse = await postWorkspace(owner.context.request, env.app, {
      action: "handoff",
      workId: sourceWorkId,
      recipientEmail: customer.email,
    });
    expect(handoffResponse.status()).toBe(201);
    const handoffBody = await handoffResponse.json() as { token?: unknown };
    expect(typeof handoffBody.token).toBe("string");
    const token = handoffBody.token as string;

    const wrongInspection = await postWorkspace(wrongRecipient.context.request, env.app, {
      action: "inspect_handoff",
      token,
    });
    expect(wrongInspection.status()).toBe(403);

    const wrongAcceptance = await postWorkspace(wrongRecipient.context.request, env.app, {
      action: "accept_handoff",
      token,
      allowAgencyAccess: true,
    });
    expect(wrongAcceptance.status()).toBe(403);

    const previewResponse = await postWorkspace(customer.context.request, env.app, {
      action: "inspect_handoff",
      token,
    });
    expect(previewResponse.status()).toBe(200);
    const previewText = await previewResponse.text();
    const preview = JSON.parse(previewText) as {
      recipientEmail?: unknown;
      agencyName?: unknown;
      accepted?: unknown;
      work?: {
        productId?: unknown;
        resourceKind?: unknown;
        payload?: unknown;
        tracker?: { id?: unknown; revision?: unknown; rowCount?: unknown; rows?: unknown[]; originalSource?: unknown };
      };
    };
    expect(preview.recipientEmail).toBe(customer.email);
    expect(preview.agencyName).toBe("Local handoff verification team");
    expect(preview.accepted).toBe(false);
    expect(preview.work?.productId).toBe("tracker");
    expect(preview.work?.resourceKind).toBe("tracker");
    expect(preview.work?.payload).toBeNull();
    expect(preview.work?.tracker?.id).toBe(trackerBody.tracker?.id);
    expect(preview.work?.tracker?.revision).toBe(0);
    expect(preview.work?.tracker?.rowCount).toBe(2);
    expect(preview.work?.tracker?.rows).toHaveLength(2);
    expect(preview.work?.tracker).not.toHaveProperty("originalSource");
    expect(previewText).not.toContain('"originalSource"');

    const acceptedResponse = await postWorkspace(customer.context.request, env.app, {
      action: "accept_handoff",
      token,
      allowAgencyAccess: true,
    });
    expect(acceptedResponse.status()).toBe(200);
    const accepted = await acceptedResponse.json() as { workspaceId?: unknown; workId?: unknown };
    expect(typeof accepted.workspaceId).toBe("string");
    expect(typeof accepted.workId).toBe("string");
    customerWorkspaceId = accepted.workspaceId as string;
    customerWorkId = accepted.workId as string;
    expect(customerWorkspaceId).not.toBe(agencyWorkspaceId);
    expect(customerWorkId).not.toBe(sourceWorkId);

    const customerRead = await customer.context.request.get(`/api/tracker?workId=${customerWorkId}`);
    expect(customerRead.status()).toBe(200);
    const customerTracker = await customerRead.json();
    expect(customerTracker.workspaceId).toBe(customerWorkspaceId);
    expect(customerTracker.tracker.id).toBe(trackerBody.tracker?.id);
    expect(customerTracker.tracker.revision).toBe(0);
    expect(customerTracker.tracker.rows).toHaveLength(2);

    const customerSnapshotResponse = await customer.context.request.get(`/api/workspace?workspaceId=${customerWorkspaceId}`);
    expect(customerSnapshotResponse.status()).toBe(200);
    const customerSnapshot = await customerSnapshotResponse.json() as {
      workspaceId?: unknown;
      work?: Array<{ id?: string; productId?: string; resourceKind?: string }>;
      delegations?: Array<{ id?: string; workId?: string; agencyWorkspaceId?: string; status?: string; canRevoke?: boolean }>;
    };
    expect(customerSnapshot.workspaceId).toBe(customerWorkspaceId);
    expect(customerSnapshot.work?.some((work) => work.id === customerWorkId && work.productId === "tracker" && work.resourceKind === "tracker")).toBe(true);
    const customerDelegation = customerSnapshot.delegations?.find((delegation) => delegation.workId === customerWorkId && delegation.status === "active");
    expect(customerDelegation).toMatchObject({ agencyWorkspaceId, canRevoke: true });
    expect(typeof customerDelegation?.id).toBe("string");
    delegationId = customerDelegation?.id as string;

    const agencySnapshotResponse = await owner.context.request.get(`/api/workspace?workspaceId=${agencyWorkspaceId}`);
    expect(agencySnapshotResponse.status()).toBe(200);
    const agencySnapshot = await agencySnapshotResponse.json() as {
      delegations?: Array<{ id?: string; workId?: string; agencyWorkspaceId?: string; status?: string; canRevoke?: boolean }>;
    };
    expect(agencySnapshot.delegations).toContainEqual({
      id: delegationId,
      workId: customerWorkId,
      agencyWorkspaceId,
      status: "active",
      canRevoke: false,
    });

    const delegatedWorkspaceSnapshotResponse = await owner.context.request.get(`/api/workspace?workspaceId=${customerWorkspaceId}`);
    expect(delegatedWorkspaceSnapshotResponse.status()).toBe(200);
    const delegatedWorkspaceSnapshot = await delegatedWorkspaceSnapshotResponse.json() as {
      workspaceId?: unknown;
      work?: Array<{ id?: string; productId?: string; resourceKind?: string }>;
      workspaces?: Array<{ id?: string; access?: string }>;
    };
    expect(delegatedWorkspaceSnapshot.workspaceId).toBe(customerWorkspaceId);
    expect(delegatedWorkspaceSnapshot.workspaces).toContainEqual(expect.objectContaining({ id: customerWorkspaceId, access: "delegated_read" }));
    expect(delegatedWorkspaceSnapshot.work).toContainEqual(expect.objectContaining({ id: customerWorkId, productId: "tracker", resourceKind: "tracker" }));

    const delegatedRead = await owner.context.request.get(`/api/tracker?workId=${customerWorkId}`);
    expect(delegatedRead.status()).toBe(200);
    expect((await delegatedRead.json()).tracker.rows).toHaveLength(2);

    const revokeResponse = await postWorkspace(customer.context.request, env.app, {
      action: "revoke_delegation",
      delegationId,
    });
    expect(revokeResponse.status()).toBe(200);
    expect(await revokeResponse.json()).toEqual({ ok: true });

    const agencyAfterRevoke = await owner.context.request.get(`/api/tracker?workId=${customerWorkId}`);
    expect(agencyAfterRevoke.status()).toBe(403);
    const customerAfterRevoke = await customer.context.request.get(`/api/tracker?workId=${customerWorkId}`);
    expect(customerAfterRevoke.status()).toBe(200);
    expect((await customerAfterRevoke.json()).tracker.rows).toHaveLength(2);

    const revokedWorkspaceResponse = await owner.context.request.get(`/api/workspace?workspaceId=${customerWorkspaceId}`);
    expect(revokedWorkspaceResponse.status()).toBe(404);
  } finally {
    await owner.context.close();
    await customer.context.close();
    await wrongRecipient.context.close();
  }
});
