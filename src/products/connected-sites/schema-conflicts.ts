/** Connected-site observations become a record-only Needs you ask. Never edits or emails. */
import { createHash } from "node:crypto";
import { fetchPinnedPublicText } from "@/lib/pinned-public-text";
import type { ProposedItem } from "@/platform/needs-you/contracts";
import { schemaConflictReleaseEnabled } from "@/platform/needs-you/release";
import { connectedSitesStore, type ConnectedSitesStore } from "./store";
import { publicFactsFromRecord, type ResolvedConnectedSite } from "./contracts";
import { platformSchemaHintSchema } from "./schema-hint";
import { comparePlatformSchema, platformSchemaFromHtml, schemaConflictSignature } from "./schema-facts";

export async function recordPlatformSchema(publicKey: string, site: ResolvedConnectedSite, origin: string | null, raw: unknown, store: ConnectedSitesStore = connectedSitesStore(), deps: { fetchPage?: (url: string) => Promise<string | null> } = {}): Promise<void> {
  if (!schemaConflictReleaseEnabled() || !site.injectSchema) return;
  platformSchemaHintSchema.parse(raw);
  let html: string | null = null;
  try { html = await (deps.fetchPage ?? (url => fetchPinnedPublicText(url, { timeoutMs: 8000, maxBytes: 2_000_000 })))(site.siteUrl); }
  catch { return; }
  if (html === null) return;
  const report = platformSchemaFromHtml(html);
  // This RPC exposes only owner/operator-stated or verified facts. Guesses
  // never enter the comparator, and no owner account/session is required.
  const context = await store.context(publicKey);
  if (!context) return;
  const conflicts = comparePlatformSchema(report, publicFactsFromRecord(context), site.siteUrl);
  if (!conflicts.length) return;
  const item: ProposedItem = {
    kind: "fact.inferred", route: "owner_decides", sourceLifecycle: "connected_site_schema", sourceId: site.id,
    revisionHash: createHash("sha256").update(schemaConflictSignature(conflicts)).digest("hex"),
    title: `Check the business facts published on ${site.siteHost}`.slice(0, 200),
    detail: conflicts.map(c => `${c.field}: website “${c.published}”; confirmed record “${c.confirmed}”.`).join(" ").slice(0, 1000),
    approveEffect: "Acknowledge the disagreement for follow-up in your website platform. No website or business facts change.",
    notYetEffect: "Nothing changes. The published website facts still need review.",
    urgent: false, adminMayDecide: true,
  };
  // SQL rechecks active key, proven host and Origin, then uses the existing
  // advisory-lock + unique-revision dedupe. Closed revisions stay closed.
  await store.recordSchemaConflict(publicKey, origin, item);
}
