import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("holds exclusive evidence locks inside the inverse transaction before checking emptiness", () => {
  const inverse = readFileSync(new URL("../../supabase/migrations/rollback-20261024122500_ux_agency_qualification.sql", import.meta.url), "utf8").toLowerCase();
  const begin = inverse.indexOf("begin;");
  const lock = inverse.indexOf("lock table public.agency_qualification_submissions, public.agency_qualification_decisions, public.agency_verifications in access exclusive mode;");
  const refusal = inverse.indexOf("agency_qualification_populated_rollback_refused");
  const drop = inverse.indexOf("drop table public.agency_qualification_submissions;");
  expect(begin).toBeGreaterThanOrEqual(0); expect(lock).toBeGreaterThan(begin); expect(refusal).toBeGreaterThan(lock); expect(drop).toBeGreaterThan(refusal);
  expect(inverse.trim().endsWith("commit;")).toBe(true);
  expect(inverse).toContain("agency_qualification_rollback_function_drift");
});
