/**
 * Shared core for the agent's `update_section` tool.
 *
 * Before this, `update_section` was duplicated ~1:1 between the dashboard-chat
 * executor (`agent-executor.ts`) and the streaming agent route
 * (`api/agent/route.ts`), and the two had DIVERGED — the route had the risk
 * model + manifest gate but not the auto-approve learning step; the executor
 * had auto-approve but not the risk model. The audit flagged that as a real
 * safety/audit divergence. This unifies the decision + persistence so both
 * surfaces behave identically, and each caller keeps only its surface-specific
 * wrapper (the route's recordActionResult + streaming, the executor's
 * scheduleVerification, and each one's Slack copy).
 *
 * Behavior is governed by one optional knob: `siteManifest`. When provided
 * (the route), the manifest gates draft/publish; when omitted (the executor,
 * which has no manifest in scope), the gate is skipped — preserving each
 * surface's existing manifest behavior while still unifying everything else.
 */

import type { ContentSection, SiteCapabilityManifest, TenantConfig } from "./types";
import {
  assessRisk,
  classifyOperation,
  generatePreviewDiffs,
  type PreviewDiff,
  type RiskAssessment,
} from "./agent-risk";
import { decideAiContentGovernance } from "./ai-governance";
import { maybeAutoApprove } from "./ai-auto-approve";
import { queueAiContentReview } from "./ai-review-queue";
import { manifestAllowsAction } from "./site-capabilities";
import { clientRevalidationTargetForSections } from "./content-revalidation";
import { revalidateClientSite } from "./revalidate-client";
import { diffFields } from "./utils";

type Governance = Awaited<ReturnType<typeof maybeAutoApprove>>;
type FieldChange = ReturnType<typeof diffFields>[number];

export interface ApplySectionUpdateInput {
  tenantId: string;
  section: ContentSection;
  /** Raw, unvalidated data from the model. Validated here against the schema. */
  data: Record<string, unknown>;
  tenantConfig: TenantConfig | null;
  /** When set, the manifest gates draft/publish. Omit to skip the gate. */
  siteManifest?: SiteCapabilityManifest;
}

export type ApplySectionUpdateResult =
  | { status: "failed"; section: string; error: string; risk?: RiskAssessment; diffs?: PreviewDiff[] }
  | {
      status: "blocked";
      section: string;
      message: string;
      reason?: string;
      risk?: RiskAssessment;
      diffs?: PreviewDiff[];
    }
  | {
      status: "published";
      section: string;
      governance: Governance;
      risk: RiskAssessment;
      diffs: PreviewDiff[];
      changes: FieldChange[];
    }
  | {
      status: "queued";
      section: string;
      eventId: string;
      governance: Governance;
      risk: RiskAssessment;
      diffs: PreviewDiff[];
      changes: FieldChange[];
    };

/**
 * Validate, govern, and persist an agent-proposed section update. Pure of any
 * streaming/notification concerns — the caller owns those. Never throws on a
 * store-write failure: a Sanity/Redis write error comes back as a clean
 * `failed` result so the agent run isn't broken by an uncaught throw.
 */
export async function applySectionUpdate(
  input: ApplySectionUpdateInput
): Promise<ApplySectionUpdateResult> {
  const { tenantId, section, data, tenantConfig, siteManifest } = input;

  // Manifest gate (route only): a section the manifest forbids drafting can't
  // be edited by the agent — it needs a custom request instead.
  if (siteManifest && !manifestAllowsAction(siteManifest, section, "draft")) {
    return {
      status: "blocked",
      section,
      message: `${section} is not editable for this site's capability manifest. Send a custom request for this change.`,
    };
  }

  const { sectionSchemas } = await import("./schemas");
  const parsed = sectionSchemas[section].safeParse(data);
  if (!parsed.success) {
    return { status: "failed", section, error: parsed.error.message };
  }

  const { getContent, setContent } = await import("./storage");
  const current = (await getContent(section, tenantId)) as unknown as Record<string, unknown>;

  const operation = classifyOperation(section, current, data);
  const risk = assessRisk(operation);
  const diffs = generatePreviewDiffs(current, data);
  const changes = diffFields(current, data);

  // Legacy array-reduction guard: never silently drop more than half of any
  // array (services, events, …). Forces an explicit confirmation.
  for (const key of Object.keys(current)) {
    if (Array.isArray(current[key]) && Array.isArray(data[key])) {
      const oldLen = (current[key] as unknown[]).length;
      const newLen = (data[key] as unknown[]).length;
      if (oldLen > 0 && newLen < oldLen * 0.5) {
        return {
          status: "blocked",
          section,
          message: `This would remove ${oldLen - newLen} of ${oldLen} ${key}. Please confirm you want to remove these specific items.`,
          risk,
          diffs,
        };
      }
    }
  }

  const baseGovernance = decideAiContentGovernance(section, parsed.data, {
    tenantAutoPublish: tenantConfig?.autoPublish,
  });
  const governance = await maybeAutoApprove(tenantConfig ?? undefined, section, baseGovernance);

  if (governance.action === "block") {
    return {
      status: "blocked",
      section,
      message: "Structural site changes require manual admin work.",
      reason: governance.reason,
      risk,
      diffs,
    };
  }

  // Route to the durable review queue when governance says review, or when the
  // risk model says this isn't safe to auto-apply, or when the manifest (if
  // present) doesn't allow publishing this section.
  const shouldRouteToReview = risk.level === "high" || (risk.level === "medium" && !risk.autoApply);
  const autoPublish =
    governance.action === "publish" &&
    !shouldRouteToReview &&
    (!siteManifest || manifestAllowsAction(siteManifest, section, "publish"));

  const { appendVersion, setDraftContent, logActivity, recordSectionUpdate } = await import("./storage");

  let eventId: string | undefined;

  if (autoPublish) {
    try {
      await setContent(section, parsed.data as Parameters<typeof setContent>[1], tenantId);
    } catch (err) {
      return {
        status: "failed",
        section,
        error: `Failed to save ${section}: ${err instanceof Error ? err.message : "write error"}`,
        risk,
        diffs,
      };
    }
    // Version history is bookkeeping — the content is already durably saved, so
    // a version-write hiccup must not turn a successful publish into a failure.
    try {
      await appendVersion(section, parsed.data, "ai", tenantId, changes);
    } catch (err) {
      console.error("[agent] appendVersion failed after publish:", err);
    }
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/");
    revalidateClientSite(tenantId, clientRevalidationTargetForSections([section])).catch((err) => {
      console.error("[agent] Failed to revalidate client site:", err);
    });
  } else {
    const event = await queueAiContentReview({
      tenantId,
      section,
      currentData: current,
      proposedData: parsed.data as Record<string, unknown>,
      diffs,
      risk,
      governance,
    });
    eventId = event.id;
    await setDraftContent(section, parsed.data as Parameters<typeof setContent>[1], tenantId);
  }

  // Activity log + section-timestamp bump are best-effort: the real work
  // (publish or queue) already landed above, so a logging failure must not be
  // reported back as a failed update (the route used to swallow these).
  try {
    await logActivity(
      {
        text: autoPublish
          ? `AI updated ${section}`
          : `AI drafted changes to ${section} (pending review)`,
        time: new Date().toISOString(),
        type: "ai",
        section,
        actor: "ai",
        changes,
        eventStatus: autoPublish ? "auto_approved" : "pending",
        governanceReason: governance.reason,
        riskLevel: risk.level,
        suppressEvent: !autoPublish,
      },
      tenantId
    );
    if (autoPublish) {
      await recordSectionUpdate(section, tenantId);
    }
  } catch (err) {
    console.error("[agent] post-update activity log failed:", err);
  }

  if (autoPublish) {
    return { status: "published", section, governance, risk, diffs, changes };
  }
  return { status: "queued", section, eventId: eventId!, governance, risk, diffs, changes };
}
