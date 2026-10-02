import { describe, expect, it } from "vitest";
import { domainClaimToRow, rowToDomainClaim } from "@/lib/db/domain-claims";
import type { DomainClaim } from "@/lib/types";
import type { Row } from "@/lib/db/client";

const row: Row<"domain_claims"> = {
  tenant_id: "example", tenant_stable_id: null, domain: "examplebusiness.com", role: "additional",
  status: "pending", dns_status: "unknown", ssl_status: "pending", verification: null,
  vercel_project_id: null, error: null, registration_attempt: null,
  created_at: "2026-10-01T12:00:00.000Z", updated_at: "2026-10-01T12:00:00.000Z",
};

describe("durable domain submission state mapping", () => {
  it("keeps legacy claim output and write fields identical when registration state is absent", () => {
    const claim = rowToDomainClaim(row);
    expect(Object.hasOwn(claim, "registrationAttempt")).toBe(false);
    expect(domainClaimToRow(claim)).toEqual({
      tenant_id: row.tenant_id, domain: row.domain, role: row.role, status: row.status,
      dns_status: row.dns_status, ssl_status: row.ssl_status, verification: null,
      vercel_project_id: null, error: null, created_at: row.created_at, updated_at: row.updated_at,
    });
  });
  it.each(["not_submitted", "unknown", "rejected", "confirmed"] as const)("retains %s through a fresh durable row read", state => {
    const claim = rowToDomainClaim({ ...row, registration_attempt: state });
    expect(claim.registrationAttempt).toBe(state);
    const written = domainClaimToRow(claim);
    expect(written.registration_attempt).toBe(state);
    expect(rowToDomainClaim({ ...row, ...written }).registrationAttempt).toBe(state);
  });
  it("preserves the state while inspection updates provider status and verification", () => {
    const claim: DomainClaim = { ...rowToDomainClaim(row), registrationAttempt: "unknown", status: "error", error: "Provider lookup unavailable" };
    expect(rowToDomainClaim({ ...row, ...domainClaimToRow(claim) })).toMatchObject({ registrationAttempt: "unknown", status: "error", error: "Provider lookup unavailable" });
  });
});
