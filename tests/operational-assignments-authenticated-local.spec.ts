import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(180_000);

async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status);
  return status >= 400 ? null : response.json();
}

test("an accepted member runs exact zero-cost work as themselves, then revocation and expiry stop the next effect", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "operational-assignment-owner");
  const operator = await signedInContext(browser, admin, "operational-assignment-operator");
  const outsider = await signedInContext(browser, admin, "operational-assignment-outsider");
  try {
    const ownerWorkspaceResponse = await owner.context.request.get("/api/workspace");
    expect(ownerWorkspaceResponse.status(), await ownerWorkspaceResponse.text()).toBe(200);
    const { workspaceId } = await ownerWorkspaceResponse.json();
    // Synchronize both verified identities into the local application user table.
    expect((await operator.context.request.get("/api/workspace")).status()).toBe(200);
    expect((await outsider.context.request.get("/api/workspace")).status()).toBe(200);
    const membership = await admin.from("workspace_memberships").insert({
      workspace_id: workspaceId,
      user_id: operator.userId,
      role: "member",
      created_by: owner.userId,
    });
    expect(membership.error, membership.error?.message).toBeNull();

    const document = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId, input: { title: "Opening procedure", text: "Original" },
    });
    let responsibility = await post(owner.context.request, "/api/operations", {
      action: "create",
      workspaceId,
      input: {
        title: "Apply approved procedure edits",
        intent: "Apply the two exact document revisions approved by the owner.",
        steps: [
          {
            id: "first", operation: "document.edit", workId: document.workId, maximumCents: 0,
            input: { kind: "edit", expectedRevision: 0, title: "Opening procedure", text: "First approved edit" },
          },
          {
            id: "second", operation: "document.edit", workId: document.workId, maximumCents: 0, dependsOn: ["first"],
            input: { kind: "edit", expectedRevision: 1, title: "Opening procedure", text: "Second approved edit" },
          },
        ],
      },
    });
    responsibility = await post(owner.context.request, "/api/operations", {
      action: "command", workId: responsibility.id,
      command: { kind: "approve", expectedRevision: responsibility.payload.revision },
    });

    // A verified outsider is still ineligible because assignments do not create membership.
    await post(owner.context.request, "/api/operational-assignments", {
      action: "offer", workId: responsibility.id,
      assignment: { assigneeEmail: outsider.email, assigneeKind: "agency", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), idempotencyKey: "outsider-offer" },
    }, 403);

    const retryableOffer = {
      action: "offer", workId: responsibility.id,
      assignment: { assigneeEmail: operator.email, assigneeKind: "staff", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), idempotencyKey: "operator-offer" },
    };
    const [firstOfferResponse, retryOfferResponse] = await Promise.all([
      owner.context.request.post("/api/operational-assignments", { headers: { origin: env.app }, data: retryableOffer }),
      owner.context.request.post("/api/operational-assignments", { headers: { origin: env.app }, data: retryableOffer }),
    ]);
    expect(firstOfferResponse.status(), await firstOfferResponse.text()).toBe(201);
    expect(retryOfferResponse.status(), await retryOfferResponse.text()).toBe(201);
    let assignment = await firstOfferResponse.json();
    expect((await retryOfferResponse.json()).id).toBe(assignment.id);
    await post(operator.context.request, "/api/operational-assignments", { action: "run", assignmentId: assignment.id }, 403);
    assignment = await post(operator.context.request, "/api/operational-assignments", { action: "accept", assignmentId: assignment.id });
    expect(assignment).toMatchObject({ status: "accepted", sponsorId: owner.userId, assigneeUserId: operator.userId, scope: ["operate"] });

    const inspection = await operator.context.request.get(`/api/operational-assignments?assignmentId=${assignment.id}`);
    expect(inspection.status(), await inspection.text()).toBe(200);
    const firstRun = await post(operator.context.request, "/api/operational-assignments", { action: "run", assignmentId: assignment.id });
    expect(firstRun.responsibility.payload).toMatchObject({ status: "ready", ownerId: owner.userId });
    expect(firstRun.responsibility.payload.history.slice(-2).map((event: { actorId: string }) => event.actorId)).toEqual([operator.userId, operator.userId]);
    const edited = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect(edited.status(), await edited.text()).toBe(200);
    expect((await edited.json()).document).toMatchObject({ text: "First approved edit", history: [expect.objectContaining({ actorId: operator.userId })] });

    assignment = await post(owner.context.request, "/api/operational-assignments", { action: "revoke", assignmentId: assignment.id });
    expect(assignment.status).toBe("revoked");
    await post(operator.context.request, "/api/operational-assignments", { action: "run", assignmentId: assignment.id }, 403);
    const stillFirst = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect((await stillFirst.json()).document.text).toBe("First approved edit");
    await post(operator.context.request, "/api/operational-assignments", {
      action: "command", assignmentId: assignment.id, command: { kind: "approve" },
    }, 400);
    await post(operator.context.request, "/api/operations", {
      action: "command", workId: responsibility.id, command: { kind: "cancel", expectedRevision: firstRun.responsibility.payload.revision },
    }, 403);

    const expiringDocument = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId, input: { title: "Expiry proof", text: "Unchanged" },
    });
    let expiringWork = await post(owner.context.request, "/api/operations", {
      action: "create", workspaceId,
      input: { title: "Expiry proof", intent: "Apply only while assigned.", steps: [{
        id: "edit", operation: "document.edit", workId: expiringDocument.workId, maximumCents: 0,
        input: { kind: "edit", expectedRevision: 0, title: "Expiry proof", text: "Must not be applied" },
      }] },
    });
    expiringWork = await post(owner.context.request, "/api/operations", {
      action: "command", workId: expiringWork.id, command: { kind: "approve", expectedRevision: expiringWork.payload.revision },
    });
    let expiringAssignment = await post(owner.context.request, "/api/operational-assignments", {
      action: "offer", workId: expiringWork.id,
      assignment: { assigneeEmail: operator.email, assigneeKind: "agent", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), idempotencyKey: "expiry-offer" },
    }, 201);
    expiringAssignment = await post(operator.context.request, "/api/operational-assignments", { action: "accept", assignmentId: expiringAssignment.id });
    const expired = await admin.from("operational_assignments").update({
      offered_at: new Date(Date.now() - 2_000).toISOString(),
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    }).eq("id", expiringAssignment.id);
    expect(expired.error, expired.error?.message).toBeNull();
    await post(operator.context.request, "/api/operational-assignments", { action: "run", assignmentId: expiringAssignment.id }, 403);
    const unchanged = await owner.context.request.get(`/api/documents?workId=${expiringDocument.workId}`);
    expect((await unchanged.json()).document.text).toBe("Unchanged");
  } finally {
    await owner.context.close();
    await operator.context.close();
    await outsider.context.close();
  }
});
