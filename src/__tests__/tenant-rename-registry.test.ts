import { describe, it, expect } from "vitest";
import { authoritativePatterns, rekeySegments } from "@/lib/tenant-rename";

/**
 * Completeness guard for the tenant-rename authoritative-store registry
 * (Deep Audit #2, #25). `authoritativePatterns` is derived from
 * docs/persistence-boundaries.md: every Redis-AUTHORITATIVE, slug-keyed store
 * must be here, or its data silently stays under the old slug on a rename
 * (audit #16 stranded goal / analytics:cfg / report-* / scan:baseline this way).
 * This is a static assertion — no Redis needed.
 */
describe("tenant-rename authoritative-store registry", () => {
  const SLUG = "sampletenant";
  const patterns = authoritativePatterns(SLUG);

  it("every pattern is scoped to the tenant slug (no unscoped wildcard could nuke another tenant)", () => {
    for (const p of patterns) {
      expect(p, `pattern must include the slug: ${p}`).toContain(SLUG);
    }
  });

  it("covers each Redis-authoritative store family documented in persistence-boundaries", () => {
    // The load-bearing set — removing any one reintroduces a silent data-strand
    // on rename. Adding a NEW authoritative store means adding it here AND below.
    const required = [
      `connections:${SLUG}:`, // OAuth tokens / provider secrets — the critical one
      `crm:${SLUG}`,
      `leads:${SLUG}`,
      `lead:${SLUG}:`,
      `orders:${SLUG}`,
      `order:${SLUG}:`,
      `reb:reply-voice:${SLUG}`,
      `reb:rewards:${SLUG}:`,
      `reb:booking:config:${SLUG}`,
      `reb:booking:overrides:${SLUG}`,
      `reb:booking:slot:${SLUG}:`,
      `reb:content-autonomy:${SLUG}`,
      `reb:engagement:${SLUG}:`,
      `threads:${SLUG}:`,
      `goal:${SLUG}`,
      `analytics:cfg:${SLUG}`,
      `reb:report-cadence:${SLUG}`,
      `reb:report-sent:${SLUG}`,
      `reb:scan:baseline:${SLUG}`,
    ];
    for (const stem of required) {
      expect(
        patterns.some((p) => p.startsWith(stem)),
        `missing authoritative store in tenant-rename registry: ${stem}*`,
      ).toBe(true);
    }
  });

  it("rekeySegments only rewrites the slug as a whole segment (never a substring)", () => {
    // The safety-critical anchoring: a slug of "gld" must not corrupt "gldf".
    expect(rekeySegments("connections:gld:google", "gld", "acme")).toBe("connections:acme:google");
    expect(rekeySegments("connections:gldf:google", "gld", "acme")).toBe("connections:gldf:google");
    expect(rekeySegments("leads:gld", "gld", "acme")).toBe("leads:acme");
  });
});
