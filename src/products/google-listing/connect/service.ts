import { assertGoogleConnectionEligible, googleConnectionEligibility } from "../connection-policy";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { patchBusinessRecord, readBusinessRecord } from "@/platform/business-record/service";
import { bindingEncryptionReady, googleBindingsEnabled, readGoogleBindingForTenant } from "@/platform/account-bindings/store";
import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { confirmationPatch, readGoogleFoundFacts, type GoogleFoundFactRead } from "../found-facts";
import type { GoogleListingClient, GoogleLocationRef } from "../client";
import { googleOwnerConnectEnabled } from "./flags";
import * as store from "./store";

/**
 * Owner "Connect Google" and what follows it: the found facts read from the
 * chosen listing, and the owner confirming or dismissing each one. Every
 * Google call here is a read. Nothing is written to Google.
 */

export async function isBusinessOwner(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
  return (await readBusinessRecord(actor, workspaceId)).access === "owner";
}

/** Whether this business can use the owner connect flow at all (no owner check). */
export async function ownerConnectAvailable(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
  return googleOwnerConnectEnabled() && googleBindingsEnabled() && bindingEncryptionReady() && await publishingEnabledForWorkspace(workspaceId, actor) && (await googleConnectionEligibility(actor, workspaceId)).eligible;
}

/** Owner, release and configuration, before any Google sign-in starts or finishes. */
export async function admitOwnerConnect(actor: WorkspaceActor, workspaceId: string): Promise<void> {
  await assertGoogleConnectionEligible(actor, workspaceId);
  if (!(await ownerConnectAvailable(actor, workspaceId))) throw new WorkspaceConflictError("Connecting Google isn't open for this business yet.");
  if (!(await isBusinessOwner(actor, workspaceId))) throw new WorkspaceAccessError("Only the business owner connects Google, with their own Google account.");
}

export interface FoundFactDeps {
  /** The native listing client for this business, read only. */
  listing(workspaceId: string): Promise<{ client: Pick<GoogleListingClient, "getLocation">; location: GoogleLocationRef } | null>;
  record: typeof store.recordGoogleFoundFacts;
}

async function nativeListing(workspaceId: string) {
  const binding = await readGoogleBindingForTenant(workspacePublishingScope(workspaceId));
  const location = binding?.status === "connected" ? binding.locations.find(item => item.isPrimary) ?? binding.locations[0] : undefined;
  if (!binding || !location) return null;
  const { tenantListingContext } = await import("../workspace");
  const ctx = await tenantListingContext(workspacePublishingScope(workspaceId), workspaceId, location.locationId);
  return { client: ctx.client, location: { accountId: location.accountId, locationId: location.locationId } };
}
export const defaultFoundFactDeps: FoundFactDeps = { listing: nativeListing, record: store.recordGoogleFoundFacts };

export type FoundFactImport = GoogleFoundFactRead["status"] | "not_connected";
/**
 * Read the connected listing's hours, phone, website, description and
 * categories into found facts. Owner only. Never confirms anything: each one
 * waits beside the record until the owner decides.
 */
export async function importGoogleFoundFacts(actor: WorkspaceActor, workspaceId: string, deps: FoundFactDeps = defaultFoundFactDeps): Promise<{ status: FoundFactImport; count: number }> {
  await admitOwnerConnect(actor, workspaceId);
  const listing = await deps.listing(workspaceId);
  if (!listing) return { status: "not_connected", count: 0 };
  const read = await readGoogleFoundFacts(listing.client, listing.location);
  if (read.status !== "found") return { status: read.status, count: 0 };
  if (!read.facts.length) return { status: "found", count: 0 };
  await deps.record(actor, workspaceId, `${listing.location.accountId}/locations/${listing.location.locationId}`, read.facts);
  return { status: "found", count: read.facts.length };
}

export interface ConfirmDeps {
  read: typeof store.readFoundFacts;
  settle: typeof store.settleFoundFact;
  record: typeof readBusinessRecord;
  patch: typeof patchBusinessRecord;
}
const defaultConfirmDeps: ConfirmDeps = { read: store.readFoundFacts, settle: store.settleFoundFact, record: readBusinessRecord, patch: patchBusinessRecord };

export type ConfirmOutcome = "confirmed" | "dismissed" | "needs_timezone" | "no_record_fact";
/**
 * The owner decides one found fact. Confirm writes it to the record as the
 * owner's own verified fact (the only way a found fact joins the record),
 * then closes it. A record write that lands but whose close fails leaves the
 * found fact open beside an equal record value; deciding again is safe
 * because the command id makes the record write replay, not repeat.
 */
export async function decideFoundFact(actor: WorkspaceActor, workspaceId: string, input: { factId: string; decision: "confirm" | "dismiss"; commandId: string }, deps: ConfirmDeps = defaultConfirmDeps): Promise<ConfirmOutcome> {
  const factId = z.string().uuid().parse(input.factId), commandId = z.string().uuid().parse(input.commandId);
  const record = await deps.record(actor, workspaceId);
  if (record.access !== "owner") throw new WorkspaceAccessError("Only the business owner confirms found facts.");
  const fact = (await deps.read(actor, workspaceId)).find(item => item.id === factId);
  if (!fact) throw new WorkspaceConflictError("That found fact was already settled.");
  if (input.decision === "dismiss") { await deps.settle(actor, workspaceId, factId, "dismissed"); return "dismissed"; }
  const planned = confirmationPatch(fact, record);
  if (!planned.ok) {
    if (planned.reason === "needs_timezone" || planned.reason === "no_record_fact") return planned.reason;
    throw new WorkspaceConflictError("That found fact doesn't fit your record. Nothing changed.");
  }
  await deps.patch(actor, workspaceId, record.revision, planned.patch, { source: "owner", commandId });
  await deps.settle(actor, workspaceId, factId, "confirmed");
  return "confirmed";
}
