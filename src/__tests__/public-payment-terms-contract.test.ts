import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasPaymentTerms, publicPaymentRequestSchema } from "@/app/pay/business/public-payment";
import { businessDepositFixture } from "@/experience/workspace/preview/deposit-fixture";

describe("public immutable payment terms contract", () => {
  it("retains issued cancellation data without supplying defaults", () => {
    const request = publicPaymentRequestSchema.parse({ ...businessDepositFixture, cancellationPolicy: { refundable: false } });
    expect(request.cancellationPolicy).toEqual({ refundable: false });
    const absent = publicPaymentRequestSchema.parse({ ...businessDepositFixture, cancellationPolicy: undefined });
    expect(absent.cancellationPolicy).toBeUndefined();
    expect(hasPaymentTerms(absent)).toBe(false);
  });
  it.each([[], "refundable", false])("refuses malformed public policy payloads", cancellationPolicy => {
    expect(publicPaymentRequestSchema.safeParse({ ...businessDepositFixture, cancellationPolicy }).success).toBe(false);
  });
  it("adds only the issued policy to the token reader and restores the exact previous function on rollback", () => {
    const original = readFileSync("supabase/migrations/20261023123500_public_payment_business_identity.sql", "utf8");
    const forward = readFileSync("supabase/migrations/20261024124600_ux_visitor_payment_terms.sql", "utf8");
    const rollback = readFileSync("supabase/migrations/rollback-20261024124600_ux_visitor_payment_terms.sql", "utf8");
    const withoutComment = (sql: string) => sql.split("\n").filter(line => !line.startsWith("--")).join("\n");
    expect(withoutComment(forward)).toBe(withoutComment(original).replace("'acceptedTerms',r.accepted_terms,", "'acceptedTerms',r.accepted_terms,'cancellationPolicy',r.cancellation_policy,"));
    expect(withoutComment(rollback)).toBe(withoutComment(original));
  });
});
