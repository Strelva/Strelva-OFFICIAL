import { workspaceRoleAllows } from "@/platform/workspaces/permissions";
import type { WorkspaceRole } from "@/platform/workspaces/types";
import { ASK_REFUSALS, ASK_TOOL_CATALOG, type AskToolId } from "./contracts";

/**
 * What the per-call check reads, fresh, right before each tool runs (spec
 * section 4, "Re-check on every call"). The route re-reads it through
 * `AskAuthorityReader` for every tool call, not once per turn.
 */
export interface AskAuthoritySnapshot {
  /** Direct membership role, or null for no membership (or delegated read). */
  role: WorkspaceRole | null;
  /** Workspace exit: false = open, true = exited, "unknown" = could not be read. */
  exited: boolean | "unknown";
  /**
   * The managed website the turn resolved to, re-read by tenant stable id.
   * `null` when the turn is not about a linked website.
   */
  site: {
    state: "linked" | "binding" | "unlinked" | "deprovisioned";
    tenantActive: boolean;
  } | null;
  /** A connected Google account with write permission (resolveGbpWriteAllowed). */
  googleWriteGranted: boolean;
  /** STRELVA_INQUIRIES_RELEASE is on. */
  inquiriesEnabled: boolean;
}

export type AskAuthorityDecision =
  | { allowed: true }
  | { allowed: false; reason: AskDenialReason; message: string };

export type AskDenialReason =
  | "no_access"
  | "not_allowed_for_role"
  | "workspace_stopped"
  | "site_not_connected"
  | "site_no_longer_connected"
  | "connection_not_granted"
  | "not_available";

const deny = (reason: AskDenialReason, message: string): AskAuthorityDecision => ({ allowed: false, reason, message });

/**
 * The one authority rule for Ask Strelva tools. Pure: the same snapshot always
 * gives the same answer, so the authority matrix test covers it completely.
 */
export function authorizeAskTool(toolId: AskToolId, snapshot: AskAuthoritySnapshot, scope: "tenant" | "workspace" = "tenant"): AskAuthorityDecision {
  const tool = ASK_TOOL_CATALOG[toolId];
  if (!tool) return deny("not_available", "That isn't something I can do here.");
  if (!snapshot.role) return deny("no_access", "This business is unavailable to your account.");
  if (tool.authority === "draft") {
    // Draft authority is `create_work`: owner, admin and member. An admin
    // never gains owner authority by asking; owner decisions are never here.
    if (!workspaceRoleAllows(snapshot.role, "create_work")) {
      return deny("not_allowed_for_role", "Your role in this business can read but not draft changes.");
    }
    if (snapshot.exited !== false) {
      return deny("workspace_stopped", "New work is stopped for this business, or its state couldn't be confirmed. Nothing changed.");
    }
  }
  if (scope === "workspace" && toolId !== "read_system") return deny("not_available", "That tool needs its connected site.");
  if (tool.needsTenant && scope !== "workspace") {
    if (!snapshot.site || snapshot.site.state === "unlinked") {
      return deny("site_not_connected", "This site isn't connected to this workspace. I can file a Request for Strelva instead.");
    }
    if (snapshot.site.state === "deprovisioned") {
      return deny("site_no_longer_connected", "This site is no longer connected to this workspace.");
    }
  }
  if ("acts" in tool && tool.acts && !snapshot.googleWriteGranted) {
    return deny("connection_not_granted", ASK_REFUSALS.ungranted_connection);
  }
  if (toolId === "draft_inquiry_reply" && !snapshot.inquiriesEnabled) {
    return deny("not_available", "Inquiry replies aren't available here yet. I can file a Request for Strelva instead.");
  }
  return { allowed: true };
}
