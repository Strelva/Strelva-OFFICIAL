/**
 * The workspace side of the ports src/lib declares in src/lib/workspace-ports.ts
 * (Strelva Reborn section 7). Each entry loads its workspace module when the
 * tenant model first calls it, so module identity and test mocks behave as a
 * direct dynamic import would. Registered by src/register-workspace-ports.ts.
 *
 * This file imports no src/lib module: the shapes are checked where the
 * loaders are registered.
 */
const inquiryPublicationServer = () => import("@/products/inquiries/server");

export const workspacePortLoaders = {
  operatorReadAdmission: () => import("@/platform/operator-read-audit/admission"),
  responsibilityProof: () => import("@/products/operations/server"),
  bookingProof: () => import("@/platform/bookings/agent-proof"),
  clientRecords: async () => {
    const [mirror, move] = await Promise.all([
      import("@/platform/client-records/mirror"),
      import("@/platform/client-records/move"),
    ]);
    return {
      mutateProviderConnection: mirror.mutateProviderConnection,
      mirrorClientRecord: mirror.mirrorClientRecord,
      mirrorClientRecordRemoval: mirror.mirrorClientRecordRemoval,
      readThroughFlag: move.readThroughFlag,
      clientRecordReadSource: move.clientRecordReadSource,
      writeClientRecord: mirror.writeClientRecord,
    };
  },

  tenantPolicy: () => import("@/platform/needs-you/tenant-settings"),

  outsideWriteReceipts: async () => {
    const receipts = await import("@/platform/operator-queue/receipts");
    const store = await import("@/platform/operator-queue/store");
    return {
      beginGoogleWrite: store.beginGoogleWrite,
      completeGoogleWrite: (attemptId: string, input: Omit<Parameters<typeof receipts.recordOutsideWrite>[0], "provider">) =>
        store.completeGoogleWrite(attemptId, receipts.outsideWritePayload({ ...input, provider: "google_business" })),
      recordReadback: store.insertReadback,
      recordGoogleWrite: (input: Omit<Parameters<typeof receipts.recordOutsideWrite>[0], "provider">) =>
        receipts.recordOutsideWrite({ ...input, provider: "google_business" }),
      recordReviewReply: (input: Parameters<typeof receipts.reviewReplyWrite>[0]) =>
        receipts.recordOutsideWrite(receipts.reviewReplyWrite(input)),
      recordDomainAdd: (input: Parameters<typeof receipts.domainAddWrite>[0]) =>
        receipts.recordOutsideWrite(receipts.domainAddWrite(input)),
      recordDomainClaimRemoval: (input: Parameters<typeof receipts.domainClaimRemovalWrite>[0]) =>
        receipts.recordOutsideWrite(receipts.domainClaimRemovalWrite(input)),
    };
  },

  businessRecord: async () => ({ ...await import("@/platform/business-record/service"), ...await import("@/platform/owner-entry/email-links") }),

  googleBindings: () => import("@/platform/account-bindings/store"),
  providerDisconnect: () => import("@/platform/provider-connections/receipt-store"),

  businessBilling: () => import("@/platform/business-billing"),

  inquiries: async () => {
    const index = await import("@/products/inquiries");
    return {
      notifyInquiryOwner: async (input: Parameters<typeof index.notifyInquiryOwner>[0]) =>
        (await import("@/products/inquiries")).notifyInquiryOwner(input),
      inquiryOutcomeProofEnabled: () => process.env.STRELVA_INQUIRY_OUTCOMES === "1",
      readTenantInquiryOutcomeProof: async (tenantId: string, from: string, to: string) =>
        (await import("@/products/inquiries")).readTenantInquiryOutcomeProof(tenantId, from, to),
      isInquiryMessageReviewEvent: index.isInquiryMessageReviewEvent,
      authorizeInquiryMessageReviewActor: index.authorizeInquiryMessageReviewActor,
      executeInquiryMessageReview: index.executeInquiryMessageReview,
      reconcileInquiryMessageReview: index.reconcileInquiryMessageReview,
      // The server entry loads only when a publication runs, as before.
      authorizeInquiryPublicationActor: async (input: Parameters<Awaited<ReturnType<typeof inquiryPublicationServer>>["authorizeInquiryPublicationActor"]>[0]) =>
        (await inquiryPublicationServer()).authorizeInquiryPublicationActor(input),
      executeInquiryPublication: async (input: Parameters<Awaited<ReturnType<typeof inquiryPublicationServer>>["executeInquiryPublication"]>[0]) =>
        (await inquiryPublicationServer()).executeInquiryPublication(input),
    };
  },

  tenantReviewReplies: () => import("@/products/google-listing/server"),

  websites: () => import("@/products/websites/index"),
  websitePublicationReadback: () => import("@/app/api/publish/native-readback"),

  publishingContent: () => import("@/products/publishing/server"),
};
