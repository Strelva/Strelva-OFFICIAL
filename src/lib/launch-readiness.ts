import type { ActivityEntry } from "@/lib/storage";
import type { TenantReadinessResult } from "@/lib/production-readiness-rules";
import type { TenantConfig } from "@/lib/types";
import type { Thread } from "@/lib/conversation-types";
import { getTenantDeliveryModel } from "@/lib/custom-repos";
import { isBillingConfigured, billingLabel } from "@/lib/billing-type";

export type LaunchReadinessStatus = "ready" | "watch" | "blocked";

export interface LaunchReadinessItem {
  id: string;
  label: string;
  status: LaunchReadinessStatus;
  detail: string;
}

export interface TenantLaunchReadiness {
  status: LaunchReadinessStatus;
  score: number;
  completed: number;
  total: number;
  items: LaunchReadinessItem[];
}

function item(
  id: string,
  label: string,
  status: LaunchReadinessStatus,
  detail: string
): LaunchReadinessItem {
  return { id, label, status, detail };
}

function hasOwnerMessage(threads: Thread[]): boolean {
  return threads.some((thread) => thread.messages.some((message) => message.role === "user"));
}

export function buildTenantLaunchReadiness(input: {
  tenant: TenantConfig;
  infrastructure: TenantReadinessResult[];
  activity: ActivityEntry[];
  threadCount: number;
  hasOwnerMessage: boolean;
  draftCount: number;
  hasWeeklyBrief: boolean;
}): TenantLaunchReadiness {
  const {
    tenant,
    infrastructure,
    activity,
    threadCount,
    hasOwnerMessage: ownerMessageSeen,
    draftCount,
    hasWeeklyBrief,
  } = input;
  const infrastructureFailures = infrastructure.filter((result) => result.status === "fail");
  const infrastructureWarnings = infrastructure.filter((result) => result.status === "warn");
  const deliveryModel = getTenantDeliveryModel(tenant);
  const aiActivity = activity.filter((entry) => entry.actor === "ai");
  const hasAiAction = aiActivity.length > 0;
  const hasOwnerEmail = Boolean(tenant.ownerEmail?.trim());

  const items: LaunchReadinessItem[] = [
    item(
      "custom-repo",
      "Custom repo delivery",
      deliveryModel === "custom_repo" ? "ready" : "watch",
      deliveryModel === "custom_repo"
        ? "Customer site is handled through a custom code repo."
        : "This tenant still uses the platform template path; avoid adding more templates."
    ),
    item(
      "owner-access",
      "Owner access path",
      hasOwnerEmail ? "ready" : "blocked",
      hasOwnerEmail
        ? `Invite can be sent to ${tenant.ownerEmail}.`
        : "Add an owner email before launch handoff."
    ),
    item(
      "infrastructure",
      "Domain and revalidation",
      infrastructureFailures.length > 0
        ? "blocked"
        : infrastructureWarnings.length > 0
          ? "watch"
          : "ready",
      infrastructureFailures.length > 0
        ? `${infrastructureFailures.length} launch infrastructure check needs work.`
        : infrastructureWarnings.length > 0
          ? `${infrastructureWarnings.length} launch infrastructure check should be watched.`
          : "Client domain, admin domain, and revalidation are configured."
    ),
    item(
      "billing",
      "Billing set",
      // "Watch", not "blocked": a client mid-onboarding without billing yet is
      // in progress, not an emergency. Treating it as blocked painted every new
      // client red on the overview and spammed launch-blocked flags. Billing
      // shows as a watch until set; real blockers are infra + no owner email.
      isBillingConfigured(tenant) ? "ready" : "watch",
      isBillingConfigured(tenant)
        ? billingLabel(tenant)
        : "No plan set — pick a tier, enter a custom monthly amount, or mark it a case study."
    ),
    // Owner engagement is an ADOPTION signal, never a launch blocker. The whole
    // value prop is that a managed client does NOT need to log in — they get
    // auto-updates + talk to us over email. So "owner hasn't used the AI" is at
    // most a "watch", never "blocked".
    item(
      "owner-ai-message",
      "Owner using the dashboard",
      ownerMessageSeen ? "ready" : "watch",
      ownerMessageSeen
        ? "Owner has chatted with the AI."
        : threadCount > 0
          ? "Threads exist, but no saved owner message yet — fine for a managed client."
          : "Owner hasn't logged in yet — expected for a managed client (we handle it; they get auto-updates + email). Not required to launch."
    ),
    item(
      "ai-action",
      "AI handled work",
      hasAiAction ? "ready" : "watch",
      hasAiAction
        ? `${aiActivity.length} AI activity item${aiActivity.length === 1 ? "" : "s"} recorded.`
        : "No AI activity has been recorded yet."
    ),
    item(
      "approval-control",
      "Approval control",
      draftCount > 0 ? "watch" : "ready",
      draftCount > 0
        ? `${draftCount} draft${draftCount === 1 ? "" : "s"} waiting for review.`
        : "No pending drafts are waiting on Jacob."
    ),
    item(
      "weekly-proof",
      "Weekly proof",
      hasWeeklyBrief ? "ready" : "watch",
      hasWeeklyBrief
        ? "A weekly report exists for this tenant."
        : "First weekly report has not been generated yet."
    ),
  ];

  const completed = items.filter((readinessItem) => readinessItem.status === "ready").length;
  const blocked = items.some((readinessItem) => readinessItem.status === "blocked");
  const watched = items.some((readinessItem) => readinessItem.status === "watch");

  return {
    status: blocked ? "blocked" : watched ? "watch" : "ready",
    score: Math.round((completed / items.length) * 100),
    completed,
    total: items.length,
    items,
  };
}

export function tenantHasOwnerMessage(threads: Thread[]): boolean {
  return hasOwnerMessage(threads);
}
