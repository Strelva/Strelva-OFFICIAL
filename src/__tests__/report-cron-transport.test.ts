import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Transport-boundary contract for the report crons (Deep Audit #2, #24). The
 * weekly + monthly report emails must go through the shared sendEmail() boundary
 * with the distinct `report@{domain}` from-address (a per-tenant sending domain),
 * NOT a re-inlined Resend call. Static assertion, consistent with the other
 * owner-copy/transport contract tests in this suite.
 */
describe("report cron email transport boundary", () => {
  for (const route of [
    "src/app/api/cron/weekly-report/route.ts",
    "src/app/api/cron/monthly-report/route.ts",
  ]) {
    it(`${route} sends via sendEmail with a report@ fromAddress`, () => {
      const src = read(route);
      expect(src).toContain("sendEmail(");
      expect(src).toContain("fromAddress: `report@${domain}`");
      // Never bypass the boundary with a direct Resend client in the cron.
      expect(src).not.toMatch(/new Resend\(/);
    });
  }
});
