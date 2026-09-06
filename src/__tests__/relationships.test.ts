import { describe, expect, it } from "vitest";
import {
  countsAsPaid,
  resolveRelationship,
  resolveRelationshipStatus,
} from "@/platform/relationships";

describe("platform relationship resolver", () => {
  it("defaults an unqualified person to User", () => {
    expect(resolveRelationship()).toMatchObject({
      status: "user",
      serviceRelationship: "none",
      paidStanding: "none",
      source: "default_user",
      context: { kind: "personal" },
    });
  });

  it("does not classify someone from a tenant context alone", () => {
    expect(resolveRelationshipStatus({
      context: { kind: "tenant", tenantId: "new-installation" },
    })).toBe("user");
  });

  it("recognizes an active purchased standing as Paid User", () => {
    expect(resolveRelationship({ paidStanding: "active" })).toMatchObject({
      status: "paid_user",
      source: "paid_standing",
    });
    expect(countsAsPaid("active")).toBe(true);
  });

  it("keeps trial, delinquent, cancelled, and comped standing explicit", () => {
    for (const paidStanding of ["trialing", "past_due", "cancelled", "comped"] as const) {
      expect(resolveRelationshipStatus({ paidStanding })).toBe("user");
      expect(countsAsPaid(paidStanding)).toBe(false);
    }
  });

  it("keeps a managed client as Client even when billing is active", () => {
    expect(resolveRelationship({
      context: { kind: "tenant", tenantId: "gldf" },
      serviceRelationship: "managed_client",
      paidStanding: "active",
    })).toMatchObject({
      status: "client",
      source: "managed_client",
      serviceRelationship: "managed_client",
      paidStanding: "active",
    });
  });

  it("allows a managed client to be Client without a paid standing", () => {
    expect(resolveRelationshipStatus({
      serviceRelationship: "managed_client",
      paidStanding: "comped",
    })).toBe("client");
  });

  it("requires an explicit enterprise service relationship", () => {
    expect(resolveRelationshipStatus({ paidStanding: "active" })).toBe("paid_user");
    expect(resolveRelationshipStatus({ serviceRelationship: "enterprise" })).toBe("enterprise");
  });

  it("keeps personal and selected-tenant contexts distinct", () => {
    expect(resolveRelationshipStatus({ paidStanding: "active" })).toBe("paid_user");
    expect(resolveRelationshipStatus({
      context: { kind: "tenant", tenantId: "gldf" },
      serviceRelationship: "managed_client",
    })).toBe("client");
  });
});
