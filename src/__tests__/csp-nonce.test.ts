import { describe, expect, it } from "vitest";
import { buildNonceReportOnlyPolicy, createCspNonce, cspNonceReportOnlyEnabled } from "@/lib/csp-nonce";

describe("csp nonce report-only helpers", () => {
  it("is on only when the flag is exactly 1", () => {
    expect(cspNonceReportOnlyEnabled({})).toBe(false);
    for (const value of ["", "0", "true", "on", " 1"]) expect(cspNonceReportOnlyEnabled({ STRELVA_CSP_NONCE_REPORT_ONLY: value })).toBe(false);
    expect(cspNonceReportOnlyEnabled({ STRELVA_CSP_NONCE_REPORT_ONLY: "1" })).toBe(true);
  });

  it("makes a fresh 24 character base64 nonce each time", () => {
    const a = createCspNonce();
    const b = createCspNonce();
    expect(a).not.toBe(b);
    for (const nonce of [a, b]) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("builds a strict-dynamic policy, with report-uri and unsafe-eval only when asked", () => {
    const policy = buildNonceReportOnlyPolicy({ nonce: "abc", reportUri: null, dev: false });
    expect(policy).toContain("'nonce-abc'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("report-uri");
    expect(policy).not.toContain("unsafe-eval");
    const dev = buildNonceReportOnlyPolicy({ nonce: "abc", reportUri: "https://x.test/r", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("report-uri https://x.test/r");
  });
});
