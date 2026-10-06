/**
 * One receipt per review reply write, in exactly one ledger
 * (docs/architecture/persistence-boundaries.md, "Google review reply receipts").
 *
 * - The legacy approve path (event-actions -> publishReviewReply) records in
 *   `outside_write_receipts` (src/platform/operator-queue/receipts.ts).
 * - The Google listing System (src/products/google-listing) records in
 *   `google_listing_receipts` and never calls the legacy writer.
 *
 * The exactly-once count on the legacy path is asserted in
 * operator-queue-receipts.test.ts; this guards the boundary between the two.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const listingFiles = readdirSync(join(root, "src/products/google-listing")).filter((file) => file.endsWith(".ts"));

describe("review reply receipt home", () => {
  it("the listing System never writes through the legacy publisher or the outside-write ledger", () => {
    expect(listingFiles.length).toBeGreaterThan(0);
    for (const file of listingFiles) {
      const source = read(`src/products/google-listing/${file}`);
      expect(source, file).not.toMatch(/gbp-replies|operator-queue\/receipts|recordOutsideWrite/);
    }
  });

  it("the legacy publisher never writes a listing receipt", () => {
    const source = read("src/lib/gbp-replies.ts");
    expect(source).toMatch(/recordOutsideWrite/);
    expect(source).not.toMatch(/google-listing|google_listing_receipt/);
  });
});
