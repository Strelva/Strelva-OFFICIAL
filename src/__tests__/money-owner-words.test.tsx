import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { periodWords } from "@/experience/workspace/money/period";
import ReviewQueue from "@/app/workspace/money-reconciliation/ReviewQueue";

it("says a whole calendar month as its name and never a zone id", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  expect(periodWords("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", now)).toBe("October");
  expect(periodWords("2025-12-01T00:00:00Z", "2026-01-01T00:00:00Z", now)).toBe("December 2025");
  expect(periodWords("2026-10-01T00:00:00Z", "2026-10-15T00:00:00Z", now)).toBe("Oct 1 to Oct 15");
  expect(periodWords("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", now)).not.toMatch(/UTC|GMT/);
  expect(periodWords(null, "2026-11-01T00:00:00Z", now)).toBeNull();
});

it("names who recorded a payment exception review and when", () => {
  const html = renderToStaticMarkup(
    <ReviewQueue
      actorId="me"
      names={{ priya: "Priya" }}
      issues={[
        { account_id: "acct", event_id: "evt_1", reason: "late_refund", event_type: "charge.refunded", object_id: "ch_1", resolution: { id: "r1", kind: "no_effect_after_review", note: "Matched the Oct 12 receipt.", reviewed_by: "priya", created_at: "2026-10-12T16:20:00Z" } },
        { account_id: "acct", event_id: "evt_2", reason: "late_refund", event_type: "charge.refunded", object_id: "ch_2", resolution: { id: "r2", kind: "effect_confirmed", note: "Ledger already shows it.", reviewed_by: "me", created_at: "2026-10-13T16:20:00Z" } },
      ]}
    />,
  );
  expect(html).toContain("Priya recorded no effect on Oct 12.");
  expect(html).toContain("You confirmed the ledger effect on Oct 13.");
  expect(html).not.toContain("Review recorded");
});
