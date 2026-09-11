/** Due follow-up sweep for the first inquiry capability.
 *
 * This is an operational entry point, not a new authority. It reads inquiry
 * records from Redis, reads the current published capability and responsibility
 * from the workspace repository, then delegates every send to delivery.ts.
 * Without a host-provided fresh reply-state adapter it blocks customer
 * follow-up, while published staff routing still runs through its own guarded
 * action.
 */

import { getAllTenants } from "@/lib/tenants";
import { getLeads, type LeadRecord } from "@/lib/leads";
import type { TenantConfig } from "@/lib/types";
import {
  DEFAULT_INQUIRY_ROUTING_POLICY,
  deliverInquiryAction,
  evaluateInquiryDelivery,
  getInquiryDeliveryMessageDigest,
  getInquiryReplyTrackingAddress,
  gateResponsibilityAction,
  inquirySubmissionFromLead,
  resolveInquiryRoute,
  runInquiryFollowUp,
  sendInquiryReply,
} from "./delivery";
import { isInquiryReplyTrackingAddress } from "./delivery-message";
import { getReceivedEmailReadback } from "@/lib/email/send";
import type {
  InquiryDeliveryApproval,
  InquiryDeliveryDependencies,
  InquiryDeliveryResult,
  PartialInquiryRoutingPolicy,
  ResponsibilityDeliveryGate,
} from "./delivery-types";
import {
  evaluateInquiryResponsibility,
  getInquiryRepository,
  recordedInquiryStatus,
} from "./server";
import type { InquiryCapabilityDefinition } from "./contracts";
import type { InquiryRepository, InquiryWorkspaceSnapshot } from "./repository";
import {
  reconcileInquiryCaptureRepairs,
  type InquiryCaptureRepairStore,
} from "./reconciliation";
import { createRedisInquiryDeliveryStore } from "./delivery-store";

const DEFAULT_FOLLOW_UP_BUDGET_HOURS = 7 * 24;

export interface InquiryFollowUpSweepOptions {
  tenants?: () => Promise<TenantConfig[]>;
  leads?: (tenantId: string, limit?: number) => Promise<LeadRecord[]>;
  repository?: InquiryRepository;
  now?: () => Date;
  /** Test/host override for the provider-backed customer reply check. */
  getFollowUpRecheck?: InquiryDeliveryDependencies["getFollowUpRecheck"];
  transport?: InquiryDeliveryDependencies["transport"];
  store?: InquiryDeliveryDependencies["store"];
  captureRepairQueue?: InquiryCaptureRepairStore;
  allowExternalSends?: boolean;
}

export interface InquiryFollowUpSweepResult {
  tenantsChecked: number;
  candidates: number;
  due: number;
  attempted: number;
  accepted: number;
  blocked: number;
  failed: number;
  captureRepairs: Awaited<ReturnType<typeof reconcileInquiryCaptureRepairs>>;
  results: InquiryDeliveryResult[];
}

/**
 * Build the worker policy from the published capability. Routing and customer
 * messages are separate actions: a routing rule enables the guarded staff
 * notification, while a follow-up rule enables the customer acknowledgement
 * and delayed follow-up. A routing-only capability therefore never invents a
 * customer message.
 */
function sweepPolicy(definition: InquiryCapabilityDefinition): PartialInquiryRoutingPolicy {
  const followUp = definition.followUp;
  const routing = definition.routing;
  return {
    version: `inquiry:${definition.id}:${definition.version}`,
    paused: false,
    autoReply: followUp
      ? { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 1 }
      : { ...DEFAULT_INQUIRY_ROUTING_POLICY.autoReply, mode: "off", enabled: false },
    followUp: followUp
      ? {
          mode: "auto",
          enabled: true,
          delayHours: followUp.afterMinutes / 60,
          budgetHours: DEFAULT_FOLLOW_UP_BUDGET_HOURS,
          maxAttempts: followUp.maxAttempts,
          messageTemplate: followUp.messageTemplate,
        }
      : { ...DEFAULT_INQUIRY_ROUTING_POLICY.followUp, mode: "off", enabled: false },
    // Capability submissions opt out of the legacy owner notice. A published
    // routing rule owns its one guarded notification instead.
    ownerNotification: routing ? "send" : "legacy",
  };
}

function currentCapability(snapshot: InquiryWorkspaceSnapshot | null, lead: LeadRecord): InquiryCapabilityDefinition | null {
  const capability = snapshot?.state.capabilities.find((item) => item.id === lead.capabilityId);
  if (!capability || capability.businessId !== snapshot?.businessId || !capability.live) return null;
  if (!["live", "live_unverified"].includes(capability.status)) return null;
  if (capability.live.version !== lead.capabilityVersion) return null;
  return capability.live;
}

function classify(result: InquiryDeliveryResult, counts: { accepted: number; blocked: number; failed: number }): void {
  if (["accepted", "verified", "accepted_unverified"].includes(result.status)) counts.accepted += 1;
  else if (["paused", "awaiting_approval", "budget_exhausted", "disabled", "not_due"].includes(result.status)) counts.blocked += 1;
  else counts.failed += 1;
}

/** Run one bounded due sweep. The caller owns cron auth and heartbeat. */
export async function runDueInquiryFollowUps(
  options: InquiryFollowUpSweepOptions = {},
): Promise<InquiryFollowUpSweepResult> {
  const now = options.now?.() ?? new Date();
  const tenants = await (options.tenants ?? getAllTenants)();
  const active = tenants.filter((tenant) => tenant.active !== false);
  const leadsReader = options.leads ?? getLeads;
  const repository = options.repository ?? getInquiryRepository();
  const deliveryStore = options.store ?? createRedisInquiryDeliveryStore();
  const results: InquiryDeliveryResult[] = [];
  const counts = { accepted: 0, blocked: 0, failed: 0 };
  let candidates = 0;
  let due = 0;
  let attempted = 0;

  const captureRepairs = await reconcileInquiryCaptureRepairs({
    queue: options.captureRepairQueue,
    repository,
    leads: leadsReader,
    tenantIds: active.map((tenant) => tenant.id),
    businessIds: Object.fromEntries(active.map((tenant) => [tenant.id, tenant.stableId ?? tenant.id])),
    now,
  });
  if (captureRepairs.status === "unavailable") counts.failed += 1;
  else counts.failed += captureRepairs.failed;

  for (const tenant of active) {
    let snapshot: InquiryWorkspaceSnapshot | null;
    let leads: LeadRecord[];
    let recordOverlays: Awaited<ReturnType<InquiryRepository["getRecordOverlays"]>> = [];
    try {
      const businessId = tenant.stableId ?? tenant.id;
      [snapshot, leads, recordOverlays] = await Promise.all([
        repository.getSnapshot(tenant.id, businessId),
        leadsReader(tenant.id, 500),
        typeof repository.getRecordOverlays === "function"
          ? repository.getRecordOverlays(tenant.id, businessId)
          : Promise.resolve([]),
      ]);
    } catch {
      counts.failed += 1;
      continue;
    }
    const overlaysByInquiryId = new Map((recordOverlays || []).map((overlay) => [overlay.inquiryId, overlay]));
    for (const lead of leads) {
      if (!lead.capabilityId || !Number.isSafeInteger(lead.capabilityVersion)) continue;
      candidates += 1;
      const overlay = overlaysByInquiryId.get(lead.id);
      const status = snapshot
        ? recordedInquiryStatus(snapshot.state, lead.id, overlay?.status ?? "new")
        : overlay?.status ?? "new";
      if (status === "handled" || status === "blocked") continue;
      const definition = currentCapability(snapshot, lead);
      if (!definition || (!definition.routing && !definition.followUp)) continue;
      const followUp = definition.followUp;
      const inquiry = {
        ...inquirySubmissionFromLead(tenant.id, lead),
        businessName: tenant.siteName,
        staffDestination: definition.routing?.destination || null,
        followUpMessageTemplate: followUp?.messageTemplate ?? null,
      };
      const policy = sweepPolicy(definition);
      const dependencies: InquiryDeliveryDependencies = {
        store: deliveryStore,
        transport: options.transport,
        allowExternalSends: options.allowExternalSends,
        now: () => now,
        resolveRoute: (currentInquiry, currentPolicy) => resolveInquiryRoute(currentInquiry, currentPolicy),
        getPolicy: async (tenantId, currentInquiry) => {
          const current = await repository.getSnapshot(tenantId, tenant.stableId ?? tenant.id);
          const currentDefinition = currentCapability(current, {
            ...lead,
            capabilityId: currentInquiry.capabilityId ?? lead.capabilityId,
            capabilityVersion: currentInquiry.capabilityVersion ?? lead.capabilityVersion,
          });
          if (!currentDefinition || (!currentDefinition.routing && !currentDefinition.followUp)) return null;
          return sweepPolicy(currentDefinition);
        },
        getResponsibilityGate: async (tenantId, currentInquiry, action, message) => {
          const current = await repository.getSnapshot(tenantId, tenant.stableId ?? tenant.id);
          const currentOverlays = await repository.getRecordOverlays(tenantId, tenant.stableId ?? tenant.id, [currentInquiry.id]);
          const currentOverlay = currentOverlays.find((item) => item.inquiryId === currentInquiry.id);
          const currentStatus = current
            ? recordedInquiryStatus(current.state, currentInquiry.id, currentOverlay?.status ?? "new")
            : currentOverlay?.status ?? "new";
          if (currentStatus === "handled" || currentStatus === "blocked") {
            return {
              allowed: false,
              action,
              evaluation: null,
              reason: currentStatus === "handled" ? "inquiry_handled" : "inquiry_blocked",
            } satisfies ResponsibilityDeliveryGate;
          }
          const currentDefinition = currentCapability(current, {
            ...lead,
            capabilityId: currentInquiry.capabilityId ?? lead.capabilityId,
            capabilityVersion: currentInquiry.capabilityVersion ?? lead.capabilityVersion,
          });
          if (!currentDefinition) return null;
          if (action === "owner_notification" && (
            !currentDefinition.routing ||
            (currentDefinition.routing.destination || null) !== (currentInquiry.staffDestination || null)
          )) {
            return {
              allowed: false,
              action,
              evaluation: null,
              reason: "recipient_route_changed",
            } satisfies ResponsibilityDeliveryGate;
          }
          const responsibility = current?.state.responsibilities.find((item) => item.capabilityId === currentInquiry.capabilityId);
          if (!responsibility) return null;
          // Evaluate the same disclosure shown by the email renderer. Owner
          // notices put the Strelva disclosure in the footer, so checking
          // paragraphs alone would incorrectly turn a valid route into an
          // approval request.
          const messageBody = [
            ...(message.options.paragraphs || []),
            message.options.footerNote || "",
          ].filter(Boolean).join("\n") || "Strelva inquiry follow-up";
          const responsibilityAction = action === "schedule_follow_up"
            ? "schedule_follow_up"
            : action === "owner_notification"
              ? "send_message"
              : "reply";
          const evaluation = current
            ? evaluateInquiryResponsibility(current, currentInquiry.capabilityId || lead.capabilityId!, responsibilityAction, messageBody, now.toISOString())
            : null;
          const gate = gateResponsibilityAction(action, responsibility, evaluation, now);
          if (action === "owner_notification" && gate.allowed && gate.evaluation?.decision === "allow") {
            const currentPolicy = sweepPolicy(currentDefinition);
            const approval: InquiryDeliveryApproval = {
              inquiryId: currentInquiry.id,
              action,
              actorId: responsibility.sponsorId,
              policyVersion: currentPolicy.version || policy.version || "inquiry-delivery",
              messageDigest: getInquiryDeliveryMessageDigest(message),
              capabilityId: currentInquiry.capabilityId,
              capabilityVersion: currentInquiry.capabilityVersion,
              approvedAt: now.toISOString(),
              explicit: true,
            };
            return { ...gate, approval } satisfies ResponsibilityDeliveryGate;
          }
          return gate;
        },
        // A signed inbound provider event records a reply state in the same
        // delivery store. Absence of that state remains fail-closed because a
        // lead list cannot prove that no reply exists.
        getFollowUpRecheck: options.getFollowUpRecheck ?? (deliveryStore.durable
            ? async (currentInquiry, checkedAt) => {
              const reply = await deliveryStore.getReplyState({ tenantId: currentInquiry.tenantId, inquiryId: currentInquiry.id });
              if (reply) {
                return {
                  checkedAt,
                  noReply: false,
                  recipientActive: true,
                  inquiryVersion: currentInquiry.inquiryVersion ?? currentInquiry.id,
                  capabilityId: currentInquiry.capabilityId || lead.capabilityId!,
                  capabilityVersion: currentInquiry.capabilityVersion || lead.capabilityVersion!,
                  reason: "customer_reply_received",
                };
              }

              // A routed staff notice is part of the causal chain for this
              // first inquiry. A permanent provider failure means the team
              // may not have seen the request, so do not contact the customer
              // automatically until the route is repaired.
              const routingCheckpoint = await deliveryStore.getCheckpoint({
                tenantId: currentInquiry.tenantId,
                inquiryId: currentInquiry.id,
                action: "owner_notification",
              }).catch(() => null);
              if (routingCheckpoint && ["bounced", "failed", "suppressed"].includes(routingCheckpoint.status)) {
                return {
                  checkedAt,
                  noReply: true,
                  recipientActive: false,
                  inquiryVersion: currentInquiry.inquiryVersion ?? currentInquiry.id,
                  capabilityId: currentInquiry.capabilityId || lead.capabilityId!,
                  capabilityVersion: currentInquiry.capabilityVersion || lead.capabilityVersion!,
                  reason: `routing_notification_${routingCheckpoint.status}`,
                };
              }

              // A provider read of the receiving mailbox is meaningful only
              // after the corresponding customer message was accepted. A
              // missing checkpoint or a permanent provider outcome cannot be
              // turned into `recipientActive: true` by absence of evidence.
              const customerCheckpoint = await deliveryStore.getCheckpoint({
                tenantId: currentInquiry.tenantId,
                inquiryId: currentInquiry.id,
                action: "reply",
              }).catch(() => null);
              if (!customerCheckpoint || !["accepted", "verified", "delivered"].includes(customerCheckpoint.status)) return null;
              // A missing webhook record is not evidence that no reply exists.
              // Ask the provider's receiving read API for a bounded, complete
              // window before allowing an automatic follow-up.
              // Prefer the address saved with the accepted message. This keeps
              // a tenant slug rename from changing the correlation address for
              // an already-sent email. Legacy checkpoints fall back to the
              // deterministic address only when the receiving domain is still
              // configured, and owner/fallback addresses remain blocked.
              const replyTo = customerCheckpoint.replyTo || getInquiryReplyTrackingAddress(currentInquiry);
              if (!replyTo || !isInquiryReplyTrackingAddress(replyTo)) return null;
              const readback = await getReceivedEmailReadback({
                replyTo,
                after: currentInquiry.receivedAt,
                sender: currentInquiry.email,
              });
              if (readback.status !== "available") return null;
              return {
                checkedAt: readback.checkedAt,
                noReply: !readback.received,
                recipientActive: true,
                inquiryVersion: currentInquiry.inquiryVersion ?? currentInquiry.id,
                capabilityId: currentInquiry.capabilityId || lead.capabilityId!,
                capabilityVersion: currentInquiry.capabilityVersion || lead.capabilityVersion!,
                reason: readback.received ? "customer_reply_received_provider_readback" : "provider_receiving_readback_no_reply",
              };
            }
          : undefined),
      };

      // Capability submissions opt out of the legacy owner notice. A routing
      // rule therefore gets one governed staff delivery here. A supervised
      // responsibility returns `awaiting_approval`; a trusted, explicitly
      // pre-authorized `send_message` evaluation supplies the exact approval
      // digest above and may proceed through the same delivery adapter.
      if (definition.routing) {
        due += 1;
        attempted += 1;
        const routingResult = await deliverInquiryAction(inquiry, "owner_notification", {
          policy,
          deps: dependencies,
        });
        results.push(routingResult);
        classify(routingResult, counts);
        if (!["accepted", "verified", "delivered", "accepted_unverified"].includes(routingResult.status)) continue;
      }

      // A routing-only capability has no customer message work. In particular,
      // removing a follow-up rule must not cause the worker to send an implicit
      // acknowledgement or follow-up.
      if (!followUp) continue;

      // A first acknowledgement is eligible only when the current
      // responsibility explicitly allows and pre-authorizes `reply`. This
      // closes the first-follow-up deadlock without making customer messaging
      // part of the default standing rule.
      const replyCheckpoint = await deliveryStore.getCheckpoint({
        tenantId: inquiry.tenantId,
        inquiryId: inquiry.id,
        action: "reply",
      }).catch(() => null);
      let initialReplySent = false;
      const retryInitialReply = !replyCheckpoint || (replyCheckpoint.status === "failed" && replyCheckpoint.retryable === true);
      if (retryInitialReply && snapshot) {
        const responsibility = snapshot.state.responsibilities.find((item) => item.capabilityId === inquiry.capabilityId);
        const evaluation = responsibility
          ? evaluateInquiryResponsibility(snapshot, inquiry.capabilityId || lead.capabilityId!, "reply", "This acknowledgement is from Strelva.", now.toISOString())
          : null;
        const gate = responsibility ? gateResponsibilityAction("reply", responsibility, evaluation, now) : null;
        if (gate?.allowed) {
          const acknowledgment = await sendInquiryReply(inquiry, { policy, responsibilityGate: gate, deps: dependencies });
          initialReplySent = ["accepted", "verified", "delivered", "accepted_unverified"].includes(acknowledgment.status);
        }
      }

      // A delayed cron must not send the acknowledgement and follow-up in one
      // pass. On later passes, anchor the configured follow-up delay to the
      // accepted acknowledgement, rather than the older intake timestamp.
      if (initialReplySent) continue;
      const latestReplyCheckpoint = await deliveryStore.getCheckpoint({
        tenantId: inquiry.tenantId,
        inquiryId: inquiry.id,
        action: "reply",
      }).catch(() => null);
      const acceptedAtMs = latestReplyCheckpoint?.acceptedAt ? Date.parse(latestReplyCheckpoint.acceptedAt) : Number.NaN;
      const followUpAnchorMs = Number.isFinite(acceptedAtMs)
        ? acceptedAtMs + followUp.afterMinutes * 60 * 1000
        : null;
      if (followUpAnchorMs !== null && now.getTime() < followUpAnchorMs) continue;

      const evaluated = evaluateInquiryDelivery(inquiry, "schedule_follow_up", policy, null, now);
      if (evaluated.status === "not_due") continue;
      due += 1;
      attempted += 1;
      const result = await runInquiryFollowUp(inquiry, { deps: dependencies });
      results.push(result);
      classify(result, counts);
    }
  }

  return {
    tenantsChecked: active.length,
    candidates,
    due,
    attempted,
    ...counts,
    captureRepairs,
    results,
  };
}
