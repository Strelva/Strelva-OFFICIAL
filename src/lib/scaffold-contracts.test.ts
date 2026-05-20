import { describe, expect, it } from "vitest";
import {
  createRevalidationBody,
  parseRevalidationPayload,
  scaffoldRoutes,
  signRevalidationBody,
  verifyRevalidationSignature,
} from "./scaffold-contracts";

describe("Scaffold Web/GLDF contract", () => {
  it("signs and verifies revalidation payloads", () => {
    const secret = "test-secret";
    const timestamp = "1700000000000";
    const body = createRevalidationBody({
      tenant: "gldf",
      paths: ["/"],
    });

    const signed = signRevalidationBody(body, secret, timestamp);

    expect(
      verifyRevalidationSignature(
        signed.body,
        secret,
        signed.headers["x-reb-timestamp"],
        signed.headers["x-reb-signature"],
        Number(timestamp)
      )
    ).toBe(true);
  });

  it("rejects tampered payloads", () => {
    const secret = "test-secret";
    const timestamp = "1700000000000";
    const body = createRevalidationBody({
      tenant: "gldf",
      paths: ["/"],
    });

    const signed = signRevalidationBody(body, secret, timestamp);
    const tampered = createRevalidationBody({
      tenant: "gldf",
      paths: ["/admin"],
    });

    expect(
      verifyRevalidationSignature(
        tampered,
        secret,
        signed.headers["x-reb-timestamp"],
        signed.headers["x-reb-signature"],
        Number(timestamp)
      )
    ).toBe(false);
  });

  it("builds stable v1 public routes", () => {
    expect(scaffoldRoutes.publicContent("gldf", "hero")).toBe("/api/v1/content/gldf/hero");
    expect(scaffoldRoutes.publicPageConfig("gldf")).toBe("/api/v1/page-config/gldf");
    expect(scaffoldRoutes.revalidate()).toBe("/api/v1/revalidate");
  });

  it("validates revalidation payloads", () => {
    expect(
      parseRevalidationPayload({
        tenant: "gldf",
        paths: ["/"],
        tags: ["content"],
      })
    ).toEqual({
      tenant: "gldf",
      paths: ["/"],
      tags: ["content"],
      all: undefined,
    });

    expect(parseRevalidationPayload({ tenant: "../bad" })).toBeNull();
    expect(parseRevalidationPayload({ tenant: "gldf", paths: [123] })).toBeNull();
  });
});
