import { describe, expect, it } from "vitest";
import { buildNonceReportOnlyPolicy, createCspNonce, cspNonceReportOnlyEnabled } from "@/lib/csp-nonce";

const enforced = "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://x.supabase.co; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'";

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
    const policy = buildNonceReportOnlyPolicy({ nonce: "abc", enforced, reportUri: null, dev: false });
    expect(policy).toContain("'nonce-abc'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("report-uri");
    expect(policy).not.toContain("unsafe-eval");
    const dev = buildNonceReportOnlyPolicy({ nonce: "abc", enforced, reportUri: "https://x.test/r", dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("report-uri https://x.test/r");
  });

  it("keeps every enforced directive and swaps only script-src", () => {
    const policy = buildNonceReportOnlyPolicy({ nonce: "abc", enforced, reportUri: null, dev: false }).split("; ");
    expect(policy).toContain("connect-src 'self' https://x.supabase.co");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy.filter((d) => d.startsWith("script-src"))).toHaveLength(1);
  });
});
