import { addEvent, getEvents } from "./events";
import {
  getActivity,
  getClickCounts,
  getLastClickDate,
} from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const REENGAGE_AFTER_DAYS = 14;

export type RetentionRisk = "healthy" | "watch" | "reengage";

export interface OwnerRetentionSignals {
  aiChangesThisWeek: number;
  trafficAfterAiUpdates: number;
  dashboardOpensThisWeek: number;
  aiChatOpensThisWeek: number;
  reportViewsThisWeek: number;
  referralsThisWeek: number;
  engagementSignalsThisWeek: number;
  noAiUsageDays: number | null;
  noDashboardOpenDays: number | null;
  churnRisk: RetentionRisk;
  riskReason: string;
  nextAction: string;
  ownerNextAction: string;
}

function daysSinceIsoDate(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

function newestActivityDate(activity: Array<{ time: string }>): string | null {
  let newest: string | null = null;
  for (const entry of activity) {
    if (!entry.time) continue;
    if (!newest || new Date(entry.time).getTime() > new Date(newest).getTime()) {
      newest = entry.time;
    }
  }
  return newest;
}

function classifyRisk(args: {
  noAiUsageDays: number | null;
  noDashboardOpenDays: number | null;
  aiChangesThisWeek: number;
  aiChatOpensThisWeek: number;
  reportViewsThisWeek: number;
}): Pick<OwnerRetentionSignals, "churnRisk" | "riskReason" | "nextAction" | "ownerNextAction"> {
  if (args.noAiUsageDays !== null && args.noAiUsageDays >= REENGAGE_AFTER_DAYS) {
    return {
      churnRisk: "reengage",
      riskReason: `No AI changes in ${args.noAiUsageDays} days`,
      nextAction: "Send a plain-English prompt with one suggested site update they can approve.",
      ownerNextAction: "Ask the AI for one small update customers will notice, like hours, services, or a fresh post.",
    };
  }

  if (args.noDashboardOpenDays !== null && args.noDashboardOpenDays >= REENGAGE_AFTER_DAYS) {
    return {
      churnRisk: "reengage",
      riskReason: `No dashboard visit in ${args.noDashboardOpenDays} days`,
      nextAction: "Send the weekly proof link with the clearest next action.",
      ownerNextAction: "Open your weekly report and pick one change for the AI to make next.",
    };
  }

  if (args.aiChangesThisWeek === 0 || args.aiChatOpensThisWeek === 0) {
    return {
      churnRisk: "watch",
      riskReason: "No AI usage signal this week",
      nextAction: "Prompt one small win: update hours, refresh a service, or draft a quick post.",
      ownerNextAction: "Give the AI one quick job: update hours, refresh a service, or draft a quick post.",
    };
  }

  if (args.reportViewsThisWeek === 0) {
    return {
      churnRisk: "watch",
      riskReason: "Weekly report has not been viewed this week",
      nextAction: "Make the proof surface more visible in the next owner touchpoint.",
      ownerNextAction: "Open the weekly report to see what changed and what to improve next.",
    };
  }

  return {
    churnRisk: "healthy",
    riskReason: "Owner engagement and AI usage are active",
    nextAction: "Keep sending useful proof and one clear next action.",
    ownerNextAction: "Keep going: one useful update each week keeps the site fresh.",
  };
}

export async function getOwnerRetentionSignals(tenantId: string): Promise<OwnerRetentionSignals> {
  const [
    pageViews,
    dashboardOpens,
    aiChatOpens,
    reportViews,
    referrals,
    aiActivity,
    lastDashboardOpen,
  ] = await Promise.all([
    getClickCounts("page-view", tenantId),
    getClickCounts("dashboard-open", tenantId),
    getClickCounts("ai-chat-open", tenantId),
    getClickCounts("report-view", tenantId),
    getClickCounts("referral-click", tenantId),
    getActivity(tenantId, { actor: "ai" }),
    getLastClickDate("dashboard-open", tenantId),
  ]);

  const weekAgo = Date.now() - WEEK_MS;
  const aiChangesThisWeek = aiActivity.filter((entry) => new Date(entry.time).getTime() >= weekAgo).length;
  const newestAiActivity = newestActivityDate(aiActivity);
  const noAiUsageDays = daysSinceIsoDate(newestAiActivity);
  const noDashboardOpenDays = daysSinceIsoDate(lastDashboardOpen);
  const trafficAfterAiUpdates = aiChangesThisWeek > 0 ? pageViews.thisWeek : 0;
  const engagementSignalsThisWeek =
    dashboardOpens.thisWeek + aiChatOpens.thisWeek + reportViews.thisWeek + referrals.thisWeek;
  const risk = classifyRisk({
    noAiUsageDays,
    noDashboardOpenDays,
    aiChangesThisWeek,
    aiChatOpensThisWeek: aiChatOpens.thisWeek,
    reportViewsThisWeek: reportViews.thisWeek,
  });

  return {
    aiChangesThisWeek,
    trafficAfterAiUpdates,
    dashboardOpensThisWeek: dashboardOpens.thisWeek,
    aiChatOpensThisWeek: aiChatOpens.thisWeek,
    reportViewsThisWeek: reportViews.thisWeek,
    referralsThisWeek: referrals.thisWeek,
    engagementSignalsThisWeek,
    noAiUsageDays,
    noDashboardOpenDays,
    ...risk,
  };
}

export async function queueRetentionReengagement(tenantId: string): Promise<{
  queued: boolean;
  risk: RetentionRisk;
  reason: string;
}> {
  const signals = await getOwnerRetentionSignals(tenantId);
  if (signals.churnRisk !== "reengage") {
    return { queued: false, risk: signals.churnRisk, reason: signals.riskReason };
  }

  const recent = await getEvents(tenantId, { status: "pending", limit: 100 });
  const duplicate = recent.find((event) =>
    event.type === "suggestion" &&
    event.metadata?.kind === "retention_reengagement" &&
    new Date(event.createdAt).getTime() >= Date.now() - WEEK_MS
  );
  if (duplicate) {
    return { queued: false, risk: signals.churnRisk, reason: "Recent re-engagement suggestion already exists" };
  }

  await addEvent({
    tenantId,
    source: "ai",
    type: "suggestion",
    title: "Make one quick site update this week",
    body: `${signals.riskReason}. ${signals.ownerNextAction}`,
    status: "pending",
    metadata: {
      kind: "retention_reengagement",
      risk: signals.churnRisk,
      reason: signals.riskReason,
      nextAction: signals.nextAction,
      signals,
    },
  });

  return { queued: true, risk: signals.churnRisk, reason: signals.riskReason };
}
