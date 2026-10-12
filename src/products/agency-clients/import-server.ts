/**
 * Import clients: preview and apply (GLOSSARY: Import clients).
 *
 * Preview reads; it never adds. Every row gets a state: ready, duplicate
 * (already this agency's client by website, or already imported from the
 * same source row), incomplete (no website and no name) or refused (with a
 * plain reason). Apply re-checks the confirmed rows and adds each ready one
 * through the ordinary add (`addAgencyClient`), which scans the site, runs
 * the AI check and issues the owner claim link. Each row's idempotency key is
 * derived from agency + source + source ref, so importing the same row again
 * replays instead of adding a second client. Rows are added a few at a time;
 * one row failing leaves the others added and is reported on its own row.
 *
 * Nothing is sent to an owner (decision R08): an added row's claim link comes
 * back once, for the agency to deliver itself.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { factValueSchemas } from "@/platform/business-record/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { normalizeWebsiteRebuildUrl } from "@/products/websites/rebuild-url";
import type { AddAgencyClientInput, AddAgencyClientResult } from "./contracts";
import {
  clientImportLimitsSchema,
  type ClientImportApplyInput,
  type ClientImportApplyResult,
  type ClientImportLimits,
  type ClientImportPreview,
  type ClientImportPreviewInput,
  type ClientImportPreviewRow,
  type ClientImportRow,
  type ClientImportSource,
} from "./import-contract";
import { addAgencyClient, AgencyClientError, agencyClientRpcFailure } from "./server";

type DbError = { message?: string; code?: string } | null;
export interface ClientImportDeps {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
  add(actor: WorkspaceActor, input: AddAgencyClientInput): Promise<AddAgencyClientResult>;
  /** Rows added at once. */
  concurrency?: number;
}

function defaultDeps(): ClientImportDeps {
  const db = getSupabase();
  if (!db) throw new AgencyClientError("Importing clients is temporarily unavailable.", 503, "unavailable");
  const client = db as unknown as Pick<ClientImportDeps, "rpc">;
  return { rpc: (name, args) => client.rpc(name, args), add: (actor, input) => addAgencyClient(actor, input) };
}

const actorArgs = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });

/**
 * The deterministic idempotency key for one source row of one agency: a
 * name-based UUID (version 5 layout) over agency, source and source ref.
 */
export function clientImportIdempotencyKey(agencyWorkspaceId: string, source: ClientImportSource, sourceRef: string): string {
  const bytes = createHash("sha256").update(`strelva:client-import:v1\n${agencyWorkspaceId.toLowerCase()}\n${source}\n${sourceRef}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Host without `www.`, then path without a trailing slash: two spellings of one website match. */
export function clientSiteKey(url: string): { host: string; key: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return { host, key: `${host}${parsed.pathname.replace(/\/+$/, "").toLowerCase()}` };
  } catch {
    return null;
  }
}

const previewReadSchema = z.object({
  addedCommandIds: z.array(z.string().uuid()),
  sameHost: z.array(z.object({ sourceUrl: z.string(), customerWorkspaceId: z.string().uuid(), name: z.string() }).passthrough()),
  limits: clientImportLimitsSchema,
}).passthrough();

interface CheckedRow { entry: ClientImportPreviewRow; key: string; url: string | null; site: { host: string; key: string } | null }

/** The row checks that need no database: website, name, found facts. */
function checkRow(row: ClientImportRow, agencyWorkspaceId: string, source: ClientImportSource): CheckedRow {
  const key = clientImportIdempotencyKey(agencyWorkspaceId, source, row.sourceRef);
  let url: string | null = null;
  if (row.url) {
    try {
      url = normalizeWebsiteRebuildUrl(row.url);
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "Enter a public website address.";
      return { entry: { row, state: "refused", reason: `“${row.url}”: ${reason}` }, key, url: null, site: null };
    }
  }
  if (!url && !row.name) return { entry: { row, state: "incomplete", reason: "Add a website or a business name." }, key, url, site: null };
  const notes: string[] = [];
  if (row.phone && !factValueSchemas.phone.safeParse(row.phone).success) notes.push("Phone not kept: it needs 7 to 15 digits.");
  if (row.address && row.address.length > 200) notes.push("Address not kept: it is longer than 200 characters.");
  return { entry: { row, state: "ready", ...(notes.length ? { note: notes.join(" ") } : {}) }, key, url, site: url ? clientSiteKey(url) : null };
}

async function checkRows(actor: WorkspaceActor, agencyWorkspaceId: string, source: ClientImportSource, rows: ClientImportRow[], deps: ClientImportDeps) {
  const checked = rows.map((row) => checkRow(row, agencyWorkspaceId, source));
  const ready = checked.filter((item) => item.entry.state === "ready");
  const { data, error } = await deps.rpc("agency_client_import_preview", {
    ...actorArgs(actor),
    p_agency_workspace_id: agencyWorkspaceId,
    p_command_ids: [...new Set(ready.map((item) => item.key))],
    p_hosts: [...new Set(ready.map((item) => item.site?.host).filter((host): host is string => Boolean(host)))],
  });
  if (error) agencyClientRpcFailure(error, "Your clients couldn't be checked. Try again.");
  const read = previewReadSchema.safeParse(data);
  if (!read.success) throw new AgencyClientError("Your clients couldn't be checked. Try again.", 503, "malformed");
  const added = new Set(read.data.addedCommandIds);
  const existing = new Map<string, string>();
  for (const client of read.data.sameHost) {
    const site = clientSiteKey(client.sourceUrl);
    if (site && !existing.has(site.key)) existing.set(site.key, client.name);
  }
  // Within the list: the first row for a website or source ref wins.
  const seenRefs = new Set<string>();
  const seenSites = new Set<string>();
  for (const item of checked) {
    if (item.entry.state !== "ready") continue;
    if (added.has(item.key)) {
      item.entry = { ...item.entry, state: "duplicate", reason: "Already imported from this list." };
    } else if (item.site && existing.has(item.site.key)) {
      item.entry = { ...item.entry, state: "duplicate", reason: `Already your client: ${existing.get(item.site.key)}.` };
    } else if (seenRefs.has(item.entry.row.sourceRef) || (item.site && seenSites.has(item.site.key))) {
      item.entry = { ...item.entry, state: "duplicate", reason: "Appears more than once in this list. The first one is used." };
    }
    seenRefs.add(item.entry.row.sourceRef);
    if (item.site) seenSites.add(item.site.key);
  }
  return { checked, limits: read.data.limits };
}

/** How many more clients this agency may add right now. */
export function clientImportRoom(limits: ClientImportLimits): number {
  return Math.max(0, Math.min(limits.daily - limits.usedToday, limits.waitingForOwner - limits.waiting));
}

/** Preview an import. Reads only: nothing is added. */
export async function previewClientImport(actor: WorkspaceActor, input: ClientImportPreviewInput, deps: ClientImportDeps = defaultDeps()): Promise<ClientImportPreview> {
  const { checked, limits } = await checkRows(actor, input.agencyWorkspaceId, input.source, input.rows, deps);
  const ready = checked.filter((item) => item.entry.state === "ready").length;
  return { rows: checked.map((item) => item.entry), limits, canAddToday: Math.min(ready, clientImportRoom(limits)) };
}

const LIMIT_CODES = new Set(["agency_client_daily_limit", "agency_client_waiting_limit"]);

/** Add the confirmed rows that are still ready, a few at a time. */
export async function applyClientImport(actor: WorkspaceActor, input: ClientImportApplyInput, deps: ClientImportDeps = defaultDeps()): Promise<ClientImportApplyResult> {
  const { checked, limits } = await checkRows(actor, input.agencyWorkspaceId, input.source, input.rows, deps);
  let room = clientImportRoom(limits);
  let stopped: string | null = room > 0 ? null : limitReason(limits);
  const queue = checked.filter((item) => item.entry.state === "ready");
  const concurrency = Math.max(1, Math.min(deps.concurrency ?? 3, 5));

  async function addOne(item: CheckedRow) {
    if (stopped || room <= 0) {
      stopped ??= limitReason(limits);
      item.entry = { ...item.entry, state: "refused", reason: stopped };
      return;
    }
    room -= 1;
    const { row } = item.entry;
    const foundFacts = {
      ...(row.phone && factValueSchemas.phone.safeParse(row.phone).success ? { phone: row.phone } : {}),
      ...(row.address && row.address.length <= 200 ? { address: row.address } : {}),
    };
    // The row's own import source, so a staged Found fact says where it came from.
    const sourceRef = row.sourceRef.replace(/\s+/g, "_").slice(0, 200);
    if (Object.keys(foundFacts).length) Object.assign(foundFacts, { source: { kind: input.source === "gohighlevel" ? "client_import_gohighlevel" : "client_import_sheet", ref: sourceRef } });
    try {
      const result = await deps.add(actor, {
        action: "add",
        agencyWorkspaceId: input.agencyWorkspaceId,
        idempotencyKey: item.key,
        ...(item.url ? { url: item.url } : {}),
        ...(row.name ? { name: row.name } : {}),
        ...(row.ownerEmail ? { ownerEmail: row.ownerEmail } : {}),
        ...(Object.keys(foundFacts).length ? { foundFacts } : {}),
      });
      if (result.client.replayed) {
        item.entry = { ...item.entry, state: "duplicate", reason: "Already imported from this list.", businessId: result.client.customerWorkspaceId };
        return;
      }
      const notes = [item.entry.note, result.ownerClaimError ? `Added, but the owner link wasn't made: ${result.ownerClaimError}` : null].filter(Boolean);
      item.entry = {
        row,
        state: "added",
        businessId: result.client.customerWorkspaceId,
        ...(result.ownerClaim ? { ownerClaimPath: result.ownerClaim.claimPath } : {}),
        ...(notes.length ? { note: notes.join(" ").slice(0, 300) } : {}),
      };
    } catch (error) {
      if (error instanceof AgencyClientError && error.code === "agency_client_idempotency_conflict") {
        item.entry = { ...item.entry, state: "duplicate", reason: "Already imported from this list with different details. Edit that client instead." };
        return;
      }
      if (error instanceof AgencyClientError && LIMIT_CODES.has(error.code)) stopped ??= error.message;
      const reason = error instanceof AgencyClientError ? error.message : "This row couldn't be added. Import the list again; added rows won't be added twice.";
      item.entry = { ...item.entry, state: "refused", reason: reason.slice(0, 300) };
    }
  }

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (next < queue.length) await addOne(queue[next++]!);
  });
  await Promise.all(workers);
  return { rows: checked.map((item) => item.entry) };
}

function limitReason(limits: ClientImportLimits): string {
  return limits.waiting >= limits.waitingForOwner
    ? "Not added: your agency has many clients still waiting for their owner. Get some of them claimed, then import again."
    : "Not added: your agency reached today's limit for new clients. Import the list again tomorrow; added rows won't be added twice.";
}

/** This agency's add limits and use, for any verified member of it. */
export async function readAgencyClientAddLimits(actor: WorkspaceActor, agencyWorkspaceId: string, deps: Pick<ClientImportDeps, "rpc"> = defaultDeps()): Promise<ClientImportLimits> {
  const { data, error } = await deps.rpc("read_agency_client_add_limits", { ...actorArgs(actor), p_agency_workspace_id: agencyWorkspaceId });
  if (error) agencyClientRpcFailure(error, "Your agency's limits couldn't be read.");
  const parsed = clientImportLimitsSchema.safeParse(data);
  if (!parsed.success) throw new AgencyClientError("Your agency's limits couldn't be read.", 503, "malformed");
  return parsed.data;
}

export const setAgencyClientAddLimitsInputSchema = z.object({
  agencyWorkspaceId: z.string().uuid(),
  /** Both set, or both null to return the agency to the shared default. */
  daily: z.number().int().min(1).max(500).nullable(),
  waitingForOwner: z.number().int().min(1).max(2000).nullable(),
  reason: z.string().trim().min(3).max(500),
  expectedRevision: z.number().int().min(0),
}).strict().refine((input) => (input.daily === null) === (input.waitingForOwner === null), "Set both limits, or clear both.");
export type SetAgencyClientAddLimitsInput = z.infer<typeof setAgencyClientAddLimitsInputSchema>;

/**
 * An operator sets one agency's add limits. Postgres checks the operator
 * (an active super admin with a verified email), the reason and the revision,
 * and keeps the change in an immutable history.
 */
export async function setAgencyClientAddLimits(operatorEmail: string, input: SetAgencyClientAddLimitsInput, deps: Pick<ClientImportDeps, "rpc"> = defaultDeps()): Promise<ClientImportLimits> {
  const parsed = setAgencyClientAddLimitsInputSchema.parse(input);
  const { data, error } = await deps.rpc("set_agency_client_add_limits", {
    p_operator_email: operatorEmail.trim().toLowerCase(),
    p_agency_workspace_id: parsed.agencyWorkspaceId,
    p_daily: parsed.daily,
    p_waiting_for_owner: parsed.waitingForOwner,
    p_reason: parsed.reason,
    p_expected_revision: parsed.expectedRevision,
  });
  if (error) agencyClientRpcFailure(error, "The agency's limits couldn't be changed.");
  const result = clientImportLimitsSchema.safeParse(data);
  if (!result.success) throw new AgencyClientError("The agency's limits couldn't be changed.", 503, "malformed");
  return result.data;
}
