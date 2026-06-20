import { describe, expect, it } from "vitest";
import {
  signPreviewToken,
  verifyPreviewToken,
  PREVIEW_TIMESTAMP_HEADER,
  PREVIEW_SIGNATURE_HEADER,
} from "@/lib/scaffold-contracts";
import { isAuthorizedPreview } from "@/lib/preview-auth";

const SECRET = "tenant-gldf-secret";

describe("signPreviewToken / verifyPreviewToken", () => {
  it("round-trips a valid token", () => {
    const { timestamp, signature } = signPreviewToken("gldf", SECRET);
    expect(verifyPreviewToken("gldf", SECRET, timestamp, signature)).toBe(true);
  });

  it("rejects a token for a different tenant (tenant-bound)", () => {
    const { timestamp, signature } = signPreviewToken("gldf", SECRET);
    expect(verifyPreviewToken("rohlax", SECRET, timestamp, signature)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const { timestamp, signature } = signPreviewToken("gldf", SECRET);
    expect(verifyPreviewToken("gldf", "other-secret", timestamp, signature)).toBe(false);
  });

  it("rejects an expired timestamp (outside the 5-minute window)", () => {
    const old = (Date.now() - 6 * 60_000).toString();
    const { signature } = signPreviewToken("gldf", SECRET, old);
    expect(verifyPreviewToken("gldf", SECRET, old, signature)).toBe(false);
  });

  it("rejects missing or malformed inputs", () => {
    expect(verifyPreviewToken("gldf", SECRET, null, null)).toBe(false);
    expect(verifyPreviewToken("gldf", SECRET, "not-a-number", "abcd")).toBe(false);
    const { timestamp } = signPreviewToken("gldf", SECRET);
    expect(verifyPreviewToken("gldf", SECRET, timestamp, "zz")).toBe(false);
  });
});

function previewRequest(headers: Record<string, string>, preview = true): Request {
  return new Request(`https://scaffoldweb.com/api/v1/content/gldf/hero${preview ? "?preview=true" : ""}`, {
    headers,
  });
}

describe("isAuthorizedPreview", () => {
  it("returns false when ?preview is absent", () => {
    const { timestamp, signature } = signPreviewToken("gldf", SECRET);
    const req = previewRequest(
      { [PREVIEW_TIMESTAMP_HEADER]: timestamp, [PREVIEW_SIGNATURE_HEADER]: signature },
      false
    );
    expect(isAuthorizedPreview(req, "gldf", SECRET)).toBe(false);
  });

  it("returns false when the tenant has no revalidationSecret", () => {
    const { timestamp, signature } = signPreviewToken("gldf", SECRET);
    const req = previewRequest({ [PREVIEW_TIMESTAMP_HEADER]: timestamp, [PREVIEW_SIGNATURE_HEADER]: signature });
    expect(isAuthorizedPreview(req, "gldf", undefined)).toBe(false);
  });

  it("returns true for a valid signed preview request", () => {
    const { timestamp, signature } = signPreviewToken("gldf", SECRET);
    const req = previewRequest({ [PREVIEW_TIMESTAMP_HEADER]: timestamp, [PREVIEW_SIGNATURE_HEADER]: signature });
    expect(isAuthorizedPreview(req, "gldf", SECRET)).toBe(true);
  });

  it("returns false for ?preview=true with no/forged signature", () => {
    expect(isAuthorizedPreview(previewRequest({}), "gldf", SECRET)).toBe(false);
    const req = previewRequest({ [PREVIEW_TIMESTAMP_HEADER]: Date.now().toString(), [PREVIEW_SIGNATURE_HEADER]: "deadbeef" });
    expect(isAuthorizedPreview(req, "gldf", SECRET)).toBe(false);
  });
});
