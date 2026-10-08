import type { GoogleGrant } from "@/lib/google-access";
import type { GoogleListingClient, GoogleLocationRef } from "./client";
import type { ListingAuthority, ListingReceipt } from "./contracts";
import { GBP_MANAGE_SCOPE } from "./health";
import type { ListingReceiptStore } from "./receipts";
import { postReviewReply } from "./service";
import { paceGoogleWrites } from "./pacing";

/**
 * A tenant's approved review reply, posted through the Google listing System.
 *
 * The tenant approve path (src/lib/event-actions.ts) reaches here when the
 * tenant is linked to a business (tenant_workspace_links) and
 * STRELVA_PUBLISHING_RELEASE is on. The write then records its one receipt in
 * google_listing_receipts and nowhere else. An unlinked tenant, or the
 * release off, keeps the legacy publisher and its outside-write receipt: one
 * ledger per write either way (docs/architecture/persistence-boundaries.md).
 *
 * An operator's or agency staff member's reply (operator_instruction) is an
 * agency acting for the business: the person must be its acting provider
 * for Google on this location (#255), rechecked by the listing service just
 * before the write. Without deps.authorizeProvider it is refused.
 *
 * Idempotency is per approval attempt (event id + the claim's attempt id). A
 * crashed attempt leaves the event "processing", which refuses any new
 * attempt, so a second key never re-sends a write Google may already hold.
 */

export type TenantReplyRoute = { kind: "legacy"; reason: "release_off" | "unlinked" | "link_unreadable" } | { kind: "listing"; workspaceId: string };

export type TenantReplyResult =
  | { status: "write_unconfirmed"; reason: string; receipt: ListingReceipt }
  /** Google took it and it read back. */
  | { status: "posted"; receipt: ListingReceipt }
  /** Google took it; the read-back failed or Google holds it for review. Done; never retried. */
  | { status: "posted_unverified" | "held_by_google"; receipt: ListingReceipt }
  /** Google already shows exactly this reply. Nothing was sent. */
  | { status: "already_on_google" }
  /** Google took it but the receipt could not be settled. Done; never retried. */
  | { status: "accepted_unrecorded"; reason: string }
  /** Nothing reached Google, or Google refused it. The approval stays open. */
  | { status: "failed" | "refused"; reason: string; receipt?: ListingReceipt };

export interface TenantReplyDeps {
  releaseEnabled(): boolean;
  bindingTarget(tenantId: string): Promise<{ workspaceId: string } | null>;
  grant(tenantId: string): Promise<GoogleGrant | null>;
  location(tenantId: string, grant: GoogleGrant): Promise<GoogleLocationRef | null>;
  accessToken(grant: GoogleGrant): Promise<string | null>;
  client(accessToken: string): GoogleListingClient;
  pace?(client: GoogleListingClient, workspaceId: string, locationId: string): GoogleListingClient;
  receipts(): ListingReceiptStore;
  notify(text: string): void;
  control?(workspaceId: string, locationId: string): Promise<{ paused: boolean }>;
  noteAccess?(workspaceId: string, locationId: string, pending: boolean): Promise<unknown>;
  /** Throws unless this person acts for Google on this location through the named agency, when supplied. */
  authorizeProvider?(workspaceId: string, userId: string, locationId: string, expectedAgencyWorkspaceId?: string): Promise<void>;
}

/** Recheck a delegate's current provider, preserving an agency staff actor's named agency. */
function providerCheck(authority: ListingAuthority, workspaceId: string, locationId: string, deps: TenantReplyDeps): { authorizeProvider?: () => Promise<void> } {
  if (authority.kind !== "operator_instruction" && authority.kind !== "operator_undo") return {};
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const staff = new RegExp(`^agency-staff:(${uuid}):(${uuid})$`, "i").exec(authority.actor);
  const userId = staff?.[2] ?? new RegExp(`^operator:(${uuid})$`, "i").exec(authority.actor)?.[1];
  const authorize = deps.authorizeProvider;
  if (staff && authorize) return { authorizeProvider: () => authorize(workspaceId, staff[2]!, locationId, staff[1]!) };
  return userId && authorize ? { authorizeProvider: () => authorize(workspaceId, userId, locationId) } : {};
}

/** Which ledger this tenant's reply belongs to. Decided before any write. */
export async function routeTenantReviewReply(tenantId: string, deps: Pick<TenantReplyDeps, "releaseEnabled" | "bindingTarget">): Promise<TenantReplyRoute> {
  if (!deps.releaseEnabled()) return { kind: "legacy", reason: "release_off" };
  let target: { workspaceId: string } | null;
  try {
    target = await deps.bindingTarget(tenantId);
  } catch {
    // The link can't be read (schema not applied, storage down). The legacy
    // path still works and still leaves exactly one receipt.
    return { kind: "legacy", reason: "link_unreadable" };
  }
  return target ? { kind: "listing", workspaceId: target.workspaceId } : { kind: "legacy", reason: "unlinked" };
}

function locationIdOf(value: string): string | null {
  const id = value.includes("/locations/") ? value.split("/locations/")[1] : value.replace(/^locations\//, "");
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

export async function postTenantReviewReply(input: {
  tenantId: string;
  workspaceId: string;
  eventId: string;
  attemptId: string;
  reviewId: string;
  text: string;
  authority: ListingAuthority;
}, deps: TenantReplyDeps): Promise<TenantReplyResult> {
  const fail = (reason: string): TenantReplyResult => {
    deps.notify(`Review reply not sent for *${input.tenantId}* (reviewId=${input.reviewId}): ${reason}`);
    return { status: "failed", reason };
  };
  // Checks before the write send nothing and leave no receipt, as before.
  const grant = await deps.grant(input.tenantId).catch(() => null);
  if (!grant || grant.status !== "connected") return fail("no_connected_google_account");
  if (grant.scopes && !grant.scopes.includes(GBP_MANAGE_SCOPE)) return fail("missing_gbp_write_scope");
  const token = await deps.accessToken(grant).catch(() => null);
  if (!token) return fail("token_refresh_failed");
  const located = await deps.location(input.tenantId, grant).catch(() => null);
  const locationId = located ? locationIdOf(located.locationId) : null;
  if (!located || !locationId) return fail("missing_account_location_meta");

  const control = await deps.control?.(input.workspaceId, locationId);
  if (control?.paused) return { status: "refused", reason: "refused_paused" };

  // Track whether Google took the reply, so a failure after acceptance is
  // never reported as "nothing sent".
  const rawClient = deps.client(token);
  const base = deps.pace ? deps.pace(rawClient, input.workspaceId, locationId) : rawClient;
  let accepted = false;
  const client: GoogleListingClient = {
    ...base,
    async updateReply(location, reviewId, comment) {
      const result = await base.updateReply(location, reviewId, comment);
      if (result.ok) accepted = true;
      return result;
    },
  };
  try {
    const outcome = await postReviewReply({
      workspaceId: input.workspaceId,
      bindingId: grant.bindingId && grant.workspaceId === input.workspaceId ? grant.bindingId : null,
      location: { accountId: located.accountId, locationId },
      lifecycle: control?.paused ? "paused" : "live",
      client,
      onWriteAccepted: async () => (await (await import("@/platform/infra/tenant-publishing")).tenantPublishingPorts()).markExecutionExternalAccepted(input.eventId),
      onWriteUnconfirmed: async () => (await (await import("@/platform/infra/tenant-publishing")).tenantPublishingPorts()).markExecutionExternalUnconfirmed(input.eventId),
      receipts: deps.receipts(),
      ...providerCheck(input.authority, input.workspaceId, locationId, deps),
    }, {
      reviewId: input.reviewId,
      text: input.text,
      authority: input.authority,
      idempotencyKey: `review-reply:${input.eventId}`.slice(0, 160),
      retryFailed: true,
    });
    if (outcome.status === "write_unconfirmed") return { status: "write_unconfirmed", reason: outcome.message, receipt: outcome.receipt };
    if (outcome.status === "refused") {
      if (outcome.reason === "api_access_pending") {
        await deps.noteAccess?.(input.workspaceId, locationId, true);
        return { status: "failed", reason: "google_access_pending" };
      }
      if (outcome.reason === "nothing_to_change") return { status: "already_on_google" };
      return fail(`refused_${outcome.reason}`);
    }
    if (outcome.status === "failed") {
      if (outcome.accessPending) await deps.noteAccess?.(input.workspaceId, locationId, true);
      deps.notify(`Review reply FAILED for *${input.tenantId}* (reviewId=${input.reviewId}): ${outcome.receipt.error ?? "Google refused it"}`);
      return { status: "failed", reason: outcome.accessPending ? "google_access_pending" : "google_refused", receipt: outcome.receipt };
    }
    if (outcome.status !== "posted") {
      deps.notify(`Review reply posted for *${input.tenantId}* (reviewId=${input.reviewId}) but not confirmed: ${outcome.status}`);
    }
    await deps.noteAccess?.(input.workspaceId, locationId, false);
    return { status: outcome.status, receipt: outcome.receipt };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "listing_write_failed";
    if (accepted) {
      deps.notify(`Review reply posted for *${input.tenantId}* (reviewId=${input.reviewId}) but its receipt could not be saved: ${reason}`);
      return { status: "accepted_unrecorded", reason };
    }
    return fail(reason);
  }
}

/** The production wiring. Imported lazily by the approve path. */
export async function defaultTenantReplyDeps(): Promise<TenantReplyDeps> {
  const [{ publishingReleaseEnabled }, bindings, access, { createHttpGoogleListingClient }, { createSupabaseReceiptStore }, { sendSlackNotification }] = await Promise.all([
    import("@/products/publishing/server"),
    import("@/platform/account-bindings/store"),
    import("@/lib/google-access"),
    import("./client"),
    import("./receipts"),
    import("@/lib/slack"),
  ]);
  return {
    releaseEnabled: () => publishingReleaseEnabled(),
    bindingTarget: async (tenantId) => {
      const { tenantReleaseFlagEnabled } = await import("@/platform/release-flags/store");
      return await tenantReleaseFlagEnabled("publishing", tenantId) ? bindings.readBindingTarget(tenantId) : null;
    },
    grant: (tenantId) => access.getGoogleGrant(tenantId),
    location: (tenantId, grant) => access.getGoogleLocation(tenantId, grant),
    accessToken: (grant) => access.getValidGoogleAccessToken(grant),
    client: (token) => createHttpGoogleListingClient(token),
    pace: (client, workspaceId, locationId) => paceGoogleWrites(client, workspaceId, locationId),
    receipts: () => createSupabaseReceiptStore(),
    control: async (workspaceId, locationId) => (await import("./controls")).readListingControl(workspaceId, locationId),
    noteAccess: async (workspaceId, locationId, pending) => (await import("./controls")).noteListingAccess(workspaceId, locationId, pending),
    notify: (text) => { sendSlackNotification({ text }).catch(() => {}); },
    authorizeProvider: async (workspaceId, userId, locationId, expectedAgencyWorkspaceId) => {
      const { getSupabase } = await import("@/platform/infra/db/client");
      const client = getSupabase();
      const user = client ? (await client.from("users").select("email").eq("id", userId).maybeSingle()).data : null;
      if (!user?.email) throw new Error("acting_provider_not_staffed");
      const { assertActingProvider } = await import("@/platform/workspaces/acting-provider");
      const agencyWorkspaceId = await assertActingProvider({ userId, verifiedEmail: user.email }, workspaceId, { effect: "google", kind: "google_location", ref: locationId });
      if (expectedAgencyWorkspaceId && agencyWorkspaceId.toLowerCase() !== expectedAgencyWorkspaceId.toLowerCase()) {
        throw new Error("acting_provider_not_staffed");
      }
    },
  };
}
