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
it("adds independent queue projections without replacing submission or approval authority", () => {
  const forward = readFileSync(new URL("../../supabase/migrations/20261025134000_done_agency_qualification_queue.sql", import.meta.url), "utf8");
  const inverse = readFileSync(new URL("../../supabase/migrations/rollback-20261025134000_done_agency_qualification_queue.sql", import.meta.url), "utf8");
  expect(forward).toContain("'independentReviewerAvailable',exists");
  expect(forward).toContain("sa.revoked_at is null and u.verified_at is not null");
  expect(forward).toContain("'canReview',not exists");
  expect(forward).not.toContain("create or replace function public.decide_agency_qualification");
  expect(forward).not.toContain("create or replace function public.submit_agency_qualification");
  expect(inverse).toContain("done_agency_qualification_queue_rollback_function_drift");
  expect(inverse).not.toMatch(/drop table public\.agency_qualification/);
});
