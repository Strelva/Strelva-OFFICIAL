import type { ResponsibilityAction, ResponsibilityEvaluation, ResponsibilityPolicy } from "@/products/inquiries/contracts";
import type { InquiryDeliveryAction, ResponsibilityDeliveryGate } from "./delivery-types";

/** Policy gate used by hosts that already evaluate a Responsibility in the engine. */
export function gateResponsibilityAction(
  action: InquiryDeliveryAction,
  policy: ResponsibilityPolicy | null | undefined,
  evaluation?: ResponsibilityEvaluation | null,
  now: Date = new Date(),
): ResponsibilityDeliveryGate {
  const responsibilityAction: ResponsibilityAction =
    action === "schedule_follow_up" ? "schedule_follow_up" : action === "owner_notification" ? "send_message" : "reply";
  if (!policy) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "responsibility_unavailable" };
  }
  if (policy.status !== "active") {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "responsibility_paused" };
  }
  if (!isWithinResponsibilityHours(policy, now)) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "outside_responsibility_hours" };
  }
  if (!policy.allowedActions.includes(responsibilityAction)) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "action_not_allowed" };
  }
  const forbidden = policy.never.some((clause) => clause.action === responsibilityAction);
  if (forbidden) {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "action_forbidden" };
  }
  // A policy's trust level is never authority by itself. Every outbound
  // action needs an explicit, current engine evaluation that says allow.
  if (evaluation?.decision !== "allow") {
    return { allowed: false, action, evaluation: evaluation ?? null, reason: "approval_required" };
  }
  const limit = Math.floor(policy.budget.dailyMessages);
  const timezone = policy.budget.timezone.trim();
  if (!Number.isFinite(limit) || limit < 1 || !timezone) {
    return { allowed: false, action, evaluation, reason: "daily_budget_unavailable" };
  }
  return {
    allowed: true,
    action,
    evaluation,
    budget: {
      limit,
      timezone,
      policyVersion: policy.id,
      now: now.toISOString(),
    },
  };
}

/** Check the policy's stated support hours without relying on the server's zone. */
export function isWithinResponsibilityHours(policy: ResponsibilityPolicy, now: Date = new Date()): boolean {
  const { timezone, days, start, end } = policy.hours;
  if (!timezone || !Array.isArray(days) || days.length === 0) return false;
  const parseMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
  };
  const startMinutes = parseMinutes(start);
  const endMinutes = parseMinutes(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday || "");
    if (day < 0 || !days.includes(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return false;
    const currentMinutes = hour * 60 + minute;
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    // An invalid or unavailable timezone must never authorize a send.
    return false;
  }
}
