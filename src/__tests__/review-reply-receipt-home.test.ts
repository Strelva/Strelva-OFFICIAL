/**
 * One receipt per review reply write, in exactly one ledger
 * (docs/architecture/persistence-boundaries.md, "Google review reply receipts").
 *
 * - The tenant approve path (event-actions) posts through the Google listing
 *   System (src/products/google-listing/tenant-replies.ts) for a tenant linked
 *   to a business while STRELVA_PUBLISHING_RELEASE is on. That write records
 *   in `google_listing_receipts` only.
 * - Otherwise (unlinked tenant, release off, link unreadable) it keeps the
 *   legacy publisher (`publishReviewReply`), which records in
 *   `outside_write_receipts` only.
 * - The choice is made once per write, before either path runs, and the two
 *   branches are exclusive.
 *
 * The behaviour of each branch is asserted in review-reply-listing-path.test.ts
 * and operator-queue-receipts.test.ts; this guards the boundary.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const listingFiles = readdirSync(join(root, "src/products/google-listing")).filter((file) => file.endsWith(".ts"));

/** The review reply branch of executeResolvedEventAction. */
function reviewReplyBranch(): string {
  const source = read("src/lib/event-actions.ts");
  const start = source.indexOf('event.metadata?.kind === "review_reply_draft"');
  const end = source.indexOf("// Remaining simple cases", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("review reply receipt home", () => {
  it("the listing System never writes through the legacy publisher or the outside-write ledger", () => {
    expect(listingFiles).toContain("tenant-replies.ts");
    for (const file of listingFiles) {
      const source = read(`src/products/google-listing/${file}`);
      expect(source, file).not.toMatch(/gbp-replies|operator-queue\/receipts|recordOutsideWrite|outside_write_receipt/);
    }
  });

  it("the legacy publisher never writes a listing receipt", () => {
    const source = read("src/lib/gbp-replies.ts");
    // Through the outside-write receipts port (Strelva Reborn section 7)...
    expect(source).toMatch(/outsideWriteReceipts\(\)\)\.recordReviewReply/);
    expect(source).not.toMatch(/google-listing|google_listing_receipt/);
    // ...which the app edge wires to the outside-write ledger, and only there.
    const ports = read("src/server/workspace-ports.ts");
    expect(ports).toMatch(/recordReviewReply: [^\n]*\n\s*receipts\.recordOutsideWrite\(receipts\.reviewReplyWrite\(input\)\)/);
  });

  it("the approve path picks one ledger per write: listing when routed there, legacy otherwise, never both", () => {
    const branch = reviewReplyBranch();
    expect(branch).toMatch(/routeTenantReviewReply/);
    const listing = branch.indexOf('if (route.kind === "listing")');
    const legacy = branch.indexOf("} else {", listing);
    expect(listing).toBeGreaterThan(0);
    expect(legacy).toBeGreaterThan(listing);
    // The listing branch posts through the listing System and never the legacy publisher.
    const listingBranch = branch.slice(listing, legacy);
    expect(listingBranch).toMatch(/postTenantReviewReply/);
    expect(listingBranch).not.toMatch(/publishReviewReply|recordOutsideWrite/);
    // The legacy publisher appears only in the else branch.
    expect(branch.slice(0, legacy)).not.toMatch(/publishReviewReply/);
    expect(branch.slice(legacy)).toMatch(/publishReviewReply/);
    expect(branch).not.toMatch(/recordOutsideWrite/);
  });
});
