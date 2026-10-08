/**
 * Workspace export schema 3 (money-and-data spec, part c).
 *
 * Additive over schema 2: the schema-2 snapshot is carried whole under
 * `workspaceSnapshot` when the owner exports; schema 3 adds the business
 * record, Systems and Connections, each linked site's data and the billing
 * state, read page by page (export_workspace_v3_category).
 *
 * Small exports return inline (the 2,000,000-byte limit is for the inline
 * response only). Larger ones are built in the background into parts and
 * downloaded by an expiring token; an operator-started build is delivered only
 * to the business record's owner recipient. A build that contains anything
 * that looks like a credential is failed, never marked ready.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { WorkspaceActor } from "@/platform/workspaces";
import type { WorkspaceExportSnapshot } from "./contracts";

export const V3_INLINE_MAXIMUM_BYTES = 2_000_000;
export const V3_PART_BYTES = 1_000_000;
export const V3_PAGE_SIZE = 1000;

export const V3_CATEGORIES = [
  "business_record", "systems", "linked_sites", "leads", "spam_held", "inquiry_timelines", "inquiry_first_replies",
  "business_payments", "payment_events", "revenue_splits", "split_payouts", "connected_merchant", "payment_requests", "payment_actions", "refund_requests", "transfer_receipts", "transfer_reversals", "platform_collections", "platform_collection_terms", "recovery_payouts",
  "booking_config", "bookings", "reviews", "content", "billing", "orders", "reward_members", "reward_transactions",
  "threads", "tenant_settings", "provider_metadata", "system_history", "system_connections", "system_outputs", "versions",
  "investigation_history", "saved_system_work", "native_records", "website_documents", "business_bookings", "booking_settings", "inquiry_events", "inquiry_delivery",
  "enterprise_units", "enterprise_unit_versions", "enterprise_unit_history", "home_finder_installations", "home_finder_receipts", "home_finder_history",
] as const;
export type V3Category = (typeof V3_CATEGORIES)[number] | "assets_manifest";

export const V3_OMITTED = [
  { category: "credentials", reason: "Passwords, API keys and OAuth tokens are never exported." },
  { category: "provider_connection_secrets", reason: "Connections are listed by name, direction and status; their secrets stay with Strelva." },
  { category: "card_data", reason: "Card details live only with Stripe; the billing state is exported without them." },
  { category: "booking_management_tokens", reason: "Booking management links are credentials." },
  { category: "inquiry_delivery_routing", reason: "Reverse routing indices, tracked reply aliases, send attempt IDs and message digests are internal delivery controls; checkpoint and reply evidence are included." },
  { category: "operator_notes", reason: "Strelva's own notes about the client are Strelva's records." },
] as const;

export const V3_UNAVAILABLE = [
  { category: "calendly_bookings_not_imported", reason: "Bookings not imported into Strelva must be exported from Calendly." },
] as const;

export type V3Assets = (tenantIds: string[]) => Promise<{ items: unknown[]; unavailable: { category: string; reason: string }[] }>;


export type V3Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

export interface V3Manifest {
  scope: "business_portability_export";
  requesterRole: "owner" | "operator";
  included: { category: string; count: number }[];
  omitted: { category: string; reason: string }[];
  unavailable: { category: string; reason: string }[];
  inlineMaximumBytes: typeof V3_INLINE_MAXIMUM_BYTES;
}

export interface V3Document {
  schemaVersion: 3;
  exportId: string;
  exportedAt: string;
  workspaceId: string;
  manifest: V3Manifest;
  /** The schema-2 snapshot, when the owner exports. */
  workspaceSnapshot: WorkspaceExportSnapshot | null;
  data: Partial<Record<V3Category, unknown[]>>;
}

export class WorkspaceExportV3Error extends Error {
  constructor(public readonly code: "denied" | "invalid" | "in_progress" | "no_owner_recipient" | "unavailable" | "secret_detected", message: string) {
    super(message);
  }
}

function rpcError(message: string | undefined): WorkspaceExportV3Error {
  const m = message ?? "";
  if (m.includes("workspace_export_denied")) return new WorkspaceExportV3Error("denied", "You can't export this business.");
  if (m.includes("workspace_export_in_progress")) return new WorkspaceExportV3Error("in_progress", "An export of this business is already being prepared.");
  if (m.includes("workspace_export_no_owner_recipient")) return new WorkspaceExportV3Error("no_owner_recipient", "This business has no owner email to send the export to.");
  if (m.includes("workspace_export_invalid")) return new WorkspaceExportV3Error("invalid", "The export request was not valid.");
  return new WorkspaceExportV3Error("unavailable", "Export is unavailable right now.");
}

// Shapes of credentials that must never appear in an export.
const SECRET_PATTERNS = [/\bsk_(?:live|test)_[A-Za-z0-9]{8,}/, /\brk_(?:live|test)_[A-Za-z0-9]{8,}/, /\bya29\.[A-Za-z0-9_-]{10,}/,
  // A credential-named key, as an object key or inside an escaped string.
  /\\?"(?:access_?token|refresh_?token|client_?secret|api_?key|password)\\?"\s*:\s*\\?"[^"\\]{6,}/i,
  /\b1\/\/0[A-Za-z0-9_-]{20,}/, /\bwhsec_[A-Za-z0-9]{8,}/, /\bre_[A-Za-z0-9]{20,}/];

export function findSecretShapes(json: string): string[] {
  return SECRET_PATTERNS.filter((pattern) => pattern.test(json)).map((pattern) => pattern.source);
}

/** Collects every category page by page. */
export async function collectWorkspaceExportV3(
  actor: WorkspaceActor,
  workspaceId: string,
  rpc: V3Rpc,
  snapshot: (actor: WorkspaceActor, workspaceId: string) => Promise<WorkspaceExportSnapshot>,
  now: () => Date = () => new Date(),
  assets?: V3Assets,
  includeOperatorSnapshot = false,
): Promise<V3Document> {
  const role = await rpc("workspace_export_v3_role", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (role.error) throw rpcError(role.error.message);
  const requesterRole = role.data === "owner" ? "owner" : "operator";
  const data: Partial<Record<V3Category, unknown[]>> = {};
  const included: { category: string; count: number }[] = [];
  const unavailable: { category: string; reason: string }[] = [...V3_UNAVAILABLE];
  for (const category of V3_CATEGORIES) {
    const items: unknown[] = [];
    let offset: number | null = 0;
    let missing = false;
    while (offset !== null) {
      const page = await rpc("export_workspace_v3_category", {
        p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
        p_category: category, p_offset: offset, p_limit: V3_PAGE_SIZE,
      });
      if (page.error) throw rpcError(page.error.message);
      const body = page.data as { items?: unknown[] | null; next?: number | null } | null;
      if (!body || body.items === null || body.items === undefined) { missing = true; break; }
      items.push(...body.items);
      offset = typeof body.next === "number" && body.next > offset ? body.next : null;
    }
    if (missing) {
      unavailable.push({ category, reason: "This kind of record is not stored in this database yet." });
      continue;
    }
    data[category] = items;
    included.push({ category, count: items.length });
  }
  if (assets) {
    const tenantIds = (data.linked_sites ?? []).flatMap(row => {
      const id = row && typeof row === "object" ? (row as { tenantId?: unknown }).tenantId : null;
      return typeof id === "string" ? [id] : [];
    });
    try {
      const manifest = await assets(tenantIds);
      data.assets_manifest = manifest.items;
      included.push({ category: "assets_manifest", count: manifest.items.length });
      unavailable.push(...manifest.unavailable);
    } catch {
      unavailable.push({ category: "assets_manifest", reason: "The media provider could not be read. Request the asset manifest again." });
    }
  } else unavailable.push({ category: "assets_manifest", reason: "The asset manifest reader is unavailable." });
  let workspaceSnapshot: WorkspaceExportSnapshot | null = null;
  if (requesterRole === "owner" || includeOperatorSnapshot) {
    workspaceSnapshot = await snapshot(actor, workspaceId);
    included.push({ category: "workspace_snapshot_schema_2", count: 1 });
  } else {
    unavailable.push({ category: "workspace_snapshot_schema_2", reason: "Saved work, apps and onboarding files are exported by the owner's own export; the operator's export carries the business and its sites." });
  }
  return {
    schemaVersion: 3,
    exportId: randomUUID(),
    exportedAt: now().toISOString(),
    workspaceId,
    manifest: { scope: "business_portability_export", requesterRole, included, omitted: [...V3_OMITTED], unavailable, inlineMaximumBytes: V3_INLINE_MAXIMUM_BYTES },
    workspaceSnapshot,
    data,
  };
}

export function splitIntoParts(body: string, partBytes = V3_PART_BYTES): string[] {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of body) {
    const size = Buffer.byteLength(char);
    if (bytes + size > partBytes && current) { parts.push(current); current = ""; bytes = 0; }
    current += char;
    bytes += size;
  }
  if (current) parts.push(current);
  return parts;
}

export type V3ExportOutcome =
  | { kind: "inline"; body: string; byteSize: number; document: V3Document }
  | { kind: "build"; buildId: string; deliverTo: string; requesterRole: "owner" | "operator" };

/**
 * The owner gets small exports inline. Anything larger, and every export the
 * operator starts, becomes a background build (`runBuild`).
 */
export async function startWorkspaceExportV3(
  actor: WorkspaceActor,
  workspaceId: string,
  deps: {
    rpc: V3Rpc;
    snapshot: (actor: WorkspaceActor, workspaceId: string) => Promise<WorkspaceExportSnapshot>;
    assets?: V3Assets;
    /** Production archive collection runs after the accepted build, including native facets. */
    background?: boolean;
    includeOperatorSnapshot?: boolean;
    schedule: (task: () => Promise<void>) => void;
    /** Sends the download link to the recipient the database chose. */
    deliver: (input: { buildId: string; token: string; deliverTo: string; workspaceId: string; tenantIds: string[]; manifest: V3Manifest }) => Promise<void>;
    onFailure?: (input: { buildId: string; reason: string }) => Promise<void> | void;
  },
): Promise<V3ExportOutcome> {
  const document = deps.background ? null : await collectWorkspaceExportV3(actor, workspaceId, deps.rpc, deps.snapshot, undefined, deps.assets, deps.includeOperatorSnapshot);
  const body = document ? JSON.stringify(document) : null;
  const byteSize = body ? Buffer.byteLength(body) : 0;
  if (document && body && document.manifest.requesterRole === "owner" && byteSize <= V3_INLINE_MAXIMUM_BYTES) {
    if (findSecretShapes(body).length) throw new WorkspaceExportV3Error("secret_detected", "The export stopped: something that looks like a credential was found. Nothing was sent.");
    return { kind: "inline", body, byteSize, document };
  }
  const started = await deps.rpc("start_workspace_export_build", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (started.error) throw rpcError(started.error.message);
  const build = started.data as { buildId: string; deliverTo: string; requesterRole: "owner" | "operator" };
  deps.schedule(async () => {
    let collected: V3Document;
    try { collected = document ?? await collectWorkspaceExportV3(actor, workspaceId, deps.rpc, deps.snapshot, undefined, deps.assets, deps.includeOperatorSnapshot); }
    catch {
      await deps.rpc("fail_workspace_export_build", { p_build_id: build.buildId, p_failure: "export_collection_failed" }).catch(() => undefined);
      await deps.onFailure?.({ buildId: build.buildId, reason: "export_collection_failed" });
      return;
    }
    const written = await writeWorkspaceExportBuild(build.buildId, body ?? JSON.stringify(collected), deps.rpc);
    if (written.status === "failed") { await deps.onFailure?.({ buildId: build.buildId, reason: written.reason }); return; }
    const tenantIds = (collected.data.linked_sites ?? []).flatMap(row => {
      const tenantId = row && typeof row === "object" ? (row as { tenantId?: unknown }).tenantId : null;
      return typeof tenantId === "string" ? [tenantId] : [];
    });
    try {
      await deps.deliver({ buildId: build.buildId, token: written.token, deliverTo: build.deliverTo, workspaceId, tenantIds, manifest: collected.manifest });
    } catch {
      // The archive remains ready. A failed email is distinct from a failed
      // build and must never expose the token through provider error text.
      await deps.onFailure?.({ buildId: build.buildId, reason: "export_link_delivery_failed" });
    }
  });
  return { kind: "build", buildId: build.buildId, deliverTo: build.deliverTo, requesterRole: build.requesterRole };
}

/** Writes the parts and completes the build. Returns the one-time token;
 *  only its sha256 is stored. Any failure fails the build (no partial ready). */
export async function writeWorkspaceExportBuild(buildId: string, body: string, rpc: V3Rpc, onToken?: (token: string) => void): Promise<{ status: "ready"; token: string } | { status: "failed"; reason: string }> {
  const fail = async (reason: string) => {
    await rpc("fail_workspace_export_build", { p_build_id: buildId, p_failure: reason }).catch(() => undefined);
    return { status: "failed" as const, reason };
  };
  try {
    if (findSecretShapes(body).length) return await fail("secret_detected");
    const parts = splitIntoParts(body);
    for (let i = 0; i < parts.length; i++) {
      const appended = await rpc("append_workspace_export_build_part", { p_build_id: buildId, p_part: i, p_body: parts[i] });
      if (appended.error) return await fail(`part ${i}: ${appended.error.message ?? "error"}`.slice(0, 200));
    }
    const document = JSON.parse(body) as V3Document;
    const token = randomBytes(32).toString("base64url");
    onToken?.(token);
    const counts = Object.fromEntries(document.manifest.included.map((c) => [c.category, c.count]));
    const completed = await rpc("complete_workspace_export_build", {
      p_build_id: buildId, p_manifest: document.manifest, p_token_hash: createHash("sha256").update(token).digest("hex"), p_category_counts: counts,
    });
    if (completed.error) return await fail(completed.error.message ?? "complete_failed");
    return { status: "ready", token };
  } catch (error) {
    return fail(error instanceof Error ? error.message.slice(0, 200) : "error");
  }
}

/** Reads every part of a ready build by its token, in order. */
export async function readWorkspaceExportBuild(buildId: string, token: string, rpc: V3Rpc): Promise<string> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const chunks: string[] = [];
  let partCount = 1;
  for (let part = 0; part < partCount; part++) {
    const read = await rpc("read_workspace_export_build_part", { p_build_id: buildId, p_token_hash: tokenHash, p_part: part });
    if (read.error) throw new WorkspaceExportV3Error("denied", "This export link is not valid or has expired.");
    const row = read.data as { body: string; partCount: number };
    partCount = row.partCount;
    chunks.push(row.body);
  }
  return chunks.join("");
}
