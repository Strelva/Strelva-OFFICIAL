import { createHash } from "node:crypto";
import { getCurrentUserTenants, requireTenantAccess } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import type { InquiryCapabilityDefinition, InquiryWork } from "./contracts";
import {
  getInquiryRepository,
  type InquiryRepository,
  type InquiryWorkspaceSnapshot,
} from "./repository";

type InquiryWorkState = InquiryWork["state"];

const ATTENTION_STATES = new Set<InquiryWorkState>([
  "planned",
  "ready_to_publish",
  "failed",
]);

export interface InquiryAttentionSummary {
  tenantId: string;
  businessId: string;
  businessName: string;
  workId: string;
  title: string;
  state: Extract<InquiryWorkState, "planned" | "ready_to_publish" | "failed">;
  requiredDecision: string;
  updatedAt: string;
}

export interface InquiryPatternSummary {
  id: string;
  sourceTenantId: string;
  sourceBusinessId: string;
  sourceBusinessName: string;
  name: string;
  version: number;
  cleanReceiptCount: number;
}

export interface InquiryPortfolio {
  attention: InquiryAttentionSummary[];
  patterns: InquiryPatternSummary[];
  unavailableTenantIds: string[];
}

export interface ResolvedInquiryPattern {
  sourceBusinessName: string;
  definition: InquiryCapabilityDefinition;
}

function safeText(value: string, fallback: string, max = 160): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (clean || fallback).slice(0, max);
}

function patternId(tenantId: string, capabilityId: string, version: number): string {
  return createHash("sha256")
    .update(`inquiry-pattern-v1\0${tenantId}\0${capabilityId}\0${version}`)
    .digest("base64url");
}

function requiredDecision(state: InquiryAttentionSummary["state"]): string {
  if (state === "planned") return "Review the plan";
  if (state === "ready_to_publish") return "Approve or revise the change";
  return "Review the failure";
}

function currentPatterns(
  tenantId: string,
  businessName: string,
  snapshot: InquiryWorkspaceSnapshot,
): InquiryPatternSummary[] {
  return snapshot.state.capabilities.flatMap((capability) => {
    const definition = capability.live;
    if (
      capability.status !== "live" ||
      !definition ||
      capability.businessId !== snapshot.businessId ||
      definition.businessId !== snapshot.businessId ||
      definition.id !== capability.id
    ) return [];
    return [{
      id: patternId(tenantId, capability.id, definition.version),
      sourceTenantId: tenantId,
      sourceBusinessId: snapshot.businessId,
      sourceBusinessName: businessName,
      name: safeText(definition.name, "Inquiry pattern"),
      version: definition.version,
      cleanReceiptCount: snapshot.state.changes.filter((change) =>
        change.capabilityId === capability.id && change.verification?.verified === true
      ).length,
    }];
  });
}

function currentAttention(
  tenantId: string,
  businessName: string,
  snapshot: InquiryWorkspaceSnapshot,
): InquiryAttentionSummary[] {
  return snapshot.state.requests.flatMap((work) => {
    if (!ATTENTION_STATES.has(work.state) || work.businessId !== snapshot.businessId) return [];
    const state = work.state as InquiryAttentionSummary["state"];
    return [{
      tenantId,
      businessId: snapshot.businessId,
      businessName,
      workId: work.id,
      title: safeText(work.intent, "Inquiry work"),
      state,
      requiredDecision: requiredDecision(state),
      updatedAt: work.updatedAt,
    }];
  });
}

/** Read only explicit, currently authorized memberships into a safe portfolio. */
export async function discoverInquiryPortfolio(
  repository: InquiryRepository = getInquiryRepository(),
): Promise<InquiryPortfolio> {
  const attention: InquiryAttentionSummary[] = [];
  const patterns: InquiryPatternSummary[] = [];
  const unavailableTenantIds: string[] = [];
  const tenantIds = [...new Set(await getCurrentUserTenants())].sort();

  for (const tenantId of tenantIds) {
    const denied = await requireTenantAccess(tenantId);
    if (denied) continue;
    try {
      const config = await getTenantConfig(tenantId);
      if (!config?.active) continue;
      const businessId = config.stableId ?? tenantId;
      const snapshot = await repository.getSnapshot(tenantId, businessId);
      if (!snapshot || snapshot.tenantId !== tenantId || snapshot.businessId !== businessId) continue;
      const businessName = safeText(config.siteName, tenantId);
      attention.push(...currentAttention(tenantId, businessName, snapshot));
      patterns.push(...currentPatterns(tenantId, businessName, snapshot));
    } catch {
      unavailableTenantIds.push(tenantId);
    }
  }

  attention.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  patterns.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return { attention, patterns, unavailableTenantIds };
}

/** Resolve an opaque summary reference only after fresh source authorization. */
export async function resolveInquiryPattern(
  id: string,
  repository: InquiryRepository = getInquiryRepository(),
): Promise<ResolvedInquiryPattern | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  const tenantIds = [...new Set(await getCurrentUserTenants())].sort();
  for (const tenantId of tenantIds) {
    if (await requireTenantAccess(tenantId)) continue;
    const config = await getTenantConfig(tenantId);
    if (!config?.active) continue;
    const businessId = config.stableId ?? tenantId;
    const snapshot = await repository.getSnapshot(tenantId, businessId);
    if (!snapshot || snapshot.tenantId !== tenantId || snapshot.businessId !== businessId) continue;
    for (const capability of snapshot.state.capabilities) {
      const definition = capability.live;
      if (
        capability.status !== "live" ||
        !definition ||
        capability.businessId !== businessId ||
        definition.businessId !== businessId ||
        definition.id !== capability.id ||
        patternId(tenantId, capability.id, definition.version) !== id
      ) continue;
      // Re-read after the match so access revocation or a new live version cannot
      // turn a stale portfolio reference into source-definition access.
      if (await requireTenantAccess(tenantId)) return null;
      const freshConfig = await getTenantConfig(tenantId);
      if (!freshConfig?.active || (freshConfig.stableId ?? tenantId) !== businessId) return null;
      const fresh = await repository.getSnapshot(tenantId, businessId);
      const live = fresh?.state.capabilities.find((item) => item.id === capability.id);
      if (
        !fresh || fresh.tenantId !== tenantId || fresh.businessId !== businessId ||
        live?.status !== "live" || !live.live || live.live.businessId !== businessId ||
        live.live.id !== capability.id || live.live.version !== definition.version ||
        patternId(tenantId, capability.id, live.live.version) !== id
      ) return null;
      return {
        sourceBusinessName: safeText(freshConfig.siteName, tenantId),
        definition: structuredClone(live.live),
      };
    }
  }
  return null;
}
