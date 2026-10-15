import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyPayLinkClosedError, agencyPayLinksEnabled, commandAgencyPayLinkRecord, formatDocumentNumber, mapPayLinkError, payLinkStore, readPublicAgencyPayLink, toLegacyPayLinkConfig } from "@/platform/agency-pay-links";
import { PayLinkConflictError, PayLinkValidationError } from "@/platform/infra/pay-links";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";

const agency = "a2830000-0000-4000-8000-000000000010";
const actor = { userId: "a2830000-0000-4000-8000-000000000011", verifiedEmail: "owner@example.test" };
const row = {
  id: "a2830000-0000-4000-8000-000000000012", slug: "harbor-site", rail: "connected_account", agencyWorkspaceId: agency, businessWorkspaceId: null,
  clientName: "Harbor Dental", description: "Website setup", door: null, amountCents: 50000, minCents: null, maxCents: null, currency: "usd",
  agencyDisplayName: "North Studio", createdBy: actor.userId, createdAt: "2026-10-15T12:00:00Z", revokedAt: null, revokedBy: null, checkoutGeneration: 0,
  legacyTenantId: null, leadSlug: null, returnUrl: null, status: "open", paidAt: null, paidAmountCents: null, invoiceNumber: 1, receiptNumber: null,
};
afterEach(() => vi.unstubAllEnvs());

describe("pay-link error mapping", () => {
  it.each([
    ["agency_pay_link_slug_taken", PayLinkConflictError],
    ["agency_pay_link_conflict", PayLinkConflictError],
    ["agency_pay_link_merchant_unavailable", PayLinkValidationError],
    ["agency_pay_link_amount_invalid", PayLinkValidationError],
    ["agency_pay_link_expired", AgencyPayLinkClosedError],
    ["agency_pay_link_closed", AgencyPayLinkClosedError],
    ["agency_pay_link_paid", AgencyPayLinkClosedError],
    ["agency_pay_link_denied", WorkspaceAccessError],
    ["connect_denied", WorkspaceAccessError],
    ["relation \"agency_pay_links\" does not exist", WorkspaceStoreError],
  ])("%s", (code, kind) => {
    const error = mapPayLinkError(code, "harbor-site");
    expect(error).toBeInstanceOf(kind);
    expect(error.message).not.toContain("agency_pay_link");
    expect(error.message).not.toContain("relation");
  });

  it("gives expired and paid links their status", () => {
    expect((mapPayLinkError("agency_pay_link_expired") as AgencyPayLinkClosedError).status).toBe(410);
    expect((mapPayLinkError("agency_pay_link_paid") as AgencyPayLinkClosedError).status).toBe(409);
  });

  it("throws the mapped error from a command and never the SQL text", async () => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: { message: "connect_denied" } })) };
    await expect(commandAgencyPayLinkRecord(actor, { action: "revoke", agencyWorkspaceId: agency, idempotencyKey: actor.userId, fingerprint: "f", slug: "harbor-site" }, db)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
});

describe("pay-link reads", () => {
  it("returns null for a missing link and parses a real one", async () => {
    expect(await readPublicAgencyPayLink("nope", { rpc: vi.fn(async () => ({ data: null, error: null })) })).toBeNull();
    const link = await readPublicAgencyPayLink("harbor-site", { rpc: vi.fn(async () => ({ data: row, error: null })) });
    expect(link?.invoiceNumber).toBe(1);
  });

  it("maps a stored link to the legacy config shape", () => {
    const config = toLegacyPayLinkConfig({ ...row, legacyTenantId: "tenant-1", door: "build", minCents: null } as never);
    expect(config).toMatchObject({ slug: "harbor-site", tenantId: "tenant-1", door: "build", customCopy: "Website setup", amountCents: 50000, agencyWorkspaceId: agency });
    expect(config).not.toHaveProperty("minCents");
  });

  it("numbers documents with six digits", () => {
    expect(formatDocumentNumber("invoice", 12)).toBe("INV-000012");
    expect(formatDocumentNumber("payment_receipt", 1)).toBe("RCT-000001");
  });
});

describe("release switches", () => {
  const on = { STRELVA_AGENCY_PAY_LINKS: "1", STRELVA_CONNECT: "1", STRIPE_SECRET_KEY: "sk_test_dummy" };
  it("is off by default and needs Connect", () => {
    expect(agencyPayLinksEnabled({})).toBe(false);
    expect(agencyPayLinksEnabled(on)).toBe(true);
    expect(agencyPayLinksEnabled({ ...on, STRELVA_CONNECT: undefined })).toBe(false);
  });
  it("refuses a live key unless the live switch is set", () => {
    expect(agencyPayLinksEnabled({ ...on, STRIPE_SECRET_KEY: "sk_live_dummy" })).toBe(false);
    expect(agencyPayLinksEnabled({ ...on, STRIPE_SECRET_KEY: "sk_live_dummy", STRELVA_AGENCY_PAY_LINKS_LIVE: "1" })).toBe(true);
  });
  it("reads the legacy store from Redis unless told otherwise", () => {
    expect(payLinkStore({})).toBe("redis");
    expect(payLinkStore({ STRELVA_PAY_LINK_STORE: "postgres" })).toBe("postgres");
  });
});
