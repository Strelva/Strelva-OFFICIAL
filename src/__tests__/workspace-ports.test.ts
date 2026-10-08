import { afterEach, describe, expect, it } from "vitest";
import { registerWorkspacePorts, workspacePorts, workspacePortsRegistered, type WorkspacePorts } from "@/lib/workspace-ports";
import { workspacePortLoaders } from "@/server/workspace-ports";
import { setReceiptWriter } from "@/platform/operator-queue/receipts";
import { setOwnerRecipientResolver, resolveOwnerNoticeRecipient } from "@/lib/owner-recipient";

// The ports src/lib declares for the workspace layers (Strelva Reborn
// section 7): vitest.setup.ts registers them like instrumentation.ts does;
// every loader resolves to the module the tenant model used to import.

const SLOT = Symbol.for("strelva.workspace-ports");
type Slot = { [SLOT]?: WorkspacePorts };

afterEach(() => {
  registerWorkspacePorts(workspacePortLoaders);
  setReceiptWriter(null);
  setOwnerRecipientResolver(null);
});

describe("workspace ports", () => {
  it("are registered at the app edge for every test, as for the server", () => {
    expect(workspacePortsRegistered()).toBe(true);
    expect(workspacePorts()).toBe(workspacePortLoaders);
  });

  it("an unregistered runtime fails loudly instead of skipping the workspace side", async () => {
    delete (globalThis as Slot)[SLOT];
    expect(workspacePortsRegistered()).toBe(false);
    expect(() => workspacePorts()).toThrow(/not registered/);
    // A lib caller that reaches a port while unregistered surfaces the error;
    // the owner-recipient rule stays fail-soft and falls back to the tenant's own address.
    await expect(resolveOwnerNoticeRecipient({ id: "t1", ownerEmail: "Owner@Example.test" }))
      .resolves.toEqual({ email: "owner@example.test", name: null, from: "tenant_fallback", workspaceId: null });
  });

  it("every port loads the workspace module with the functions src/lib calls", async () => {
    const ports = workspacePorts();
    const expected: Record<keyof WorkspacePorts, string[]> = {
      operatorNoticeRecipients: ["resolveLeadNotifyRecipients"],
      bookingEmails: ["sendBookingConfirmation", "sendNewBookingOwnerEmail"],
      operatorNotices: ["sendNewIntakeLeadEmail", "sendNewSignupEmail", "sendPaymentFailedEmail"],
      bookingProof: ["readAgentRequestProof"],
      clientRecords: ["mirrorClientRecord", "mirrorClientRecordRemoval", "readThroughFlag"],
      tenantPolicy: ["readTenantPolicyRoute", "writeTenantPolicySetting", "contentAutonomyFromRoute", "planContentAutonomy", "replyModeFromRoute", "planReplyMode"],
      outsideWriteReceipts: ["recordReviewReply", "recordDomainAdd", "recordDomainClaimRemoval"],
      businessRecord: ["resolveTenantOwnerRecipient"],
      googleBindings: ["googleBindingsEnabled", "readBindingTarget", "readGoogleBindingForTenant", "setGoogleBindingStatus", "updateGoogleBindingTokens", "upsertGoogleBinding", "upsertGoogleLocation", "BindingEncryptionRefused", "AccountBindingStoreError"],
      providerDisconnect: ["recordTenantProviderDisconnect"],
      businessBilling: ["businessBillingCheckoutMetadata"],
      inquiries: ["isInquiryMessageReviewEvent", "authorizeInquiryMessageReviewActor", "executeInquiryMessageReview", "reconcileInquiryMessageReview", "authorizeInquiryPublicationActor", "executeInquiryPublication"],
      tenantReviewReplies: ["defaultTenantReplyDeps", "routeTenantReviewReply", "postTenantReviewReply"],
      publishingContent: ["executePublishingEvent", "authorizePublishingEvent", "prepareTenantCollectionDraft"],
      websites: ["websiteRebuildReleaseMayBeOn", "websiteRebuildReleasedFor", "websiteDocumentStore", "readWebsiteRebuild", "readSiteNodes", "patchWebsiteRebuild"],
      websitePublicationReadback: ["observeAcceptedNativePublish"],
    };
    expect(Object.keys(ports).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, members] of Object.entries(expected) as [keyof WorkspacePorts, string[]][]) {
      const port = (await ports[name]()) as unknown as Record<string, unknown>;
      for (const member of members) expect(port[member], `${name}.${member}`).toBeDefined();
    }
  // Cold-imports every workspace module graph; transform time, not runtime.
  }, 30_000);

  it("a port returns the same module instance a direct import does", async () => {
    const direct = await import("@/platform/account-bindings/store");
    const viaPort = await workspacePorts().googleBindings();
    expect(viaPort.AccountBindingStoreError).toBe(direct.AccountBindingStoreError);
    expect(viaPort.readGoogleBindingForTenant).toBe(direct.readGoogleBindingForTenant);
  });

  it("the receipts port writes exactly the outside-write receipt the builder makes", async () => {
    const written: Record<string, unknown>[] = [];
    setReceiptWriter(async (receipt) => {
      written.push(receipt);
      return { id: "r1" } as never;
    });
    const receipts = await workspacePorts().outsideWriteReceipts();
    const { reviewReplyWrite, domainClaimRemovalWrite } = await import("@/platform/operator-queue/receipts");
    const reply = { tenantId: "t1", reviewId: "rv1", replyText: "Thank you!", actor: "owner", outcome: { kind: "rejected" as const, detail: "Google answered 400." } };
    await receipts.recordReviewReply(reply);
    const removal = { tenantId: "t1", domain: "example.test", actor: "strelva", at: "2026-10-06T00:00:00Z", before: null, readback: { result: "matched" as const, detail: "gone" } };
    await receipts.recordDomainClaimRemoval(removal);
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({ commandKey: reviewReplyWrite(reply).commandKey, writeKind: "review_reply", acceptance: "rejected", readback: "not_possible" });
    expect(written[1]).toMatchObject({ commandKey: domainClaimRemovalWrite(removal).commandKey });
  });

  it("a storage failure in the receipts port is reported, never thrown (as before)", async () => {
    setReceiptWriter(async () => { throw new Error("storage down"); });
    const receipts = await workspacePorts().outsideWriteReceipts();
    await expect(receipts.recordReviewReply({ tenantId: "t1", reviewId: "rv1", replyText: "Hi", actor: "owner", outcome: { kind: "unknown", detail: "x" } }))
      .resolves.toEqual({ recorded: false, reason: "storage down" });
  });
});
