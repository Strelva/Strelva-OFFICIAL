import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTrackSignatureHeaders } from "../../custom-repo-starter/track-signature";
import { normalizeTrackPublicKey, verifyTrackSignature } from "@/lib/track-signature";

describe("signed tracking contract", () => {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyBase64 = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const tenant = "gldf";
  const origin = "https://gldf.example";
  const rawBody = JSON.stringify({ event: "order", orderId: "stripe-session-1", amountCents: 2499 });

  function signed(timestamp = Date.now().toString()) {
    const headers = createTrackSignatureHeaders({ tenant, origin, rawBody, privateKeyBase64, timestamp });
    if (!headers) throw new Error("Test signer failed");
    return headers;
  }

  it("round-trips the site signature and normalizes the public key", () => {
    const headers = signed();
    expect(normalizeTrackPublicKey(publicKey)).toContain("BEGIN PUBLIC KEY");
    expect(verifyTrackSignature({
      publicKey,
      tenant,
      origin,
      timestamp: headers["x-reb-track-timestamp"]!,
      signature: headers["x-reb-track-signature"]!,
      rawBody,
    })).toBe(true);
  });

  it("rejects tampering with the tenant, origin, or raw body", () => {
    const headers = signed();
    const base = {
      publicKey,
      timestamp: headers["x-reb-track-timestamp"]!,
      signature: headers["x-reb-track-signature"]!,
      rawBody,
    };
    expect(verifyTrackSignature({ ...base, tenant: "rohlax", origin })).toBe(false);
    expect(verifyTrackSignature({ ...base, tenant, origin: "https://attacker.example" })).toBe(false);
    expect(verifyTrackSignature({ ...base, tenant, origin, rawBody: `${rawBody} ` })).toBe(false);
  });

  it("rejects stale timestamps, malformed signatures, and non-Ed25519 keys", () => {
    const stale = signed((Date.now() - 6 * 60 * 1000).toString());
    expect(verifyTrackSignature({
      publicKey,
      tenant,
      origin,
      timestamp: stale["x-reb-track-timestamp"]!,
      signature: stale["x-reb-track-signature"]!,
      rawBody,
    })).toBe(false);
    expect(normalizeTrackPublicKey("not a public key")).toBeNull();
    expect(verifyTrackSignature({
      publicKey: "not a public key",
      tenant,
      origin,
      timestamp: Date.now().toString(),
      signature: "invalid",
      rawBody,
    })).toBe(false);
  });
});
