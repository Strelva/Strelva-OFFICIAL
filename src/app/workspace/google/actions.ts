"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { readLinkedSite } from "@/platform/owner-entry/linked-sites";
import { hasTenantPermission } from "@/platform/infra/auth";
import { publishingEnabledForWorkspace } from "@/products/publishing/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { prepareGoogleListingDraft, undoWorkspaceGoogleChange, setListingPaused, changeWorkspaceGoogleReply } from "@/products/google-listing/server";
import { resolveEventAction } from "@/lib/event-actions";
import { getEventRaw } from "@/lib/events";
import { z } from "zod";

export async function googleListingAction(form: FormData): Promise<void> {
  const workspaceId = z.string().uuid().parse(form.get("workspaceId"));
  const tenantId = z.string().min(1).max(120).parse(form.get("tenantId"));
  const locationId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).parse(form.get("locationId"));
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const user = await getSessionUser().catch(() => null);
  if (!user?.id || !user.email || !user.email_confirmed_at) redirect("/sign-in");
  const actor = { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
  if (!(await publishingEnabledForWorkspace(workspaceId, actor)) || !(await readLinkedSite(actor, workspaceId, tenantId)) || !(await hasTenantPermission(tenantId, "publishing:manage"))) redirect(`/workspace?workspaceId=${workspaceId}`);
  let result = "";
  try {
    const action = String(form.get("action"));
    if (action === "pause" || action === "resume") {
      await setListingPaused(actor, workspaceId, locationId, action === "pause");
      result = action === "pause" ? "Paused. Reviews still sync; replies and changes wait." : "Resumed. Your drafts still need approval.";
    } else if (action === "approve" || action === "decline") {
      const eventId = z.string().min(1).max(200).parse(form.get("eventId"));
      const event = await getEventRaw(eventId);
      if (event?.tenantId !== tenantId || event.metadata?.kind !== "workspace_google_listing_draft" || event.metadata.workspaceId !== workspaceId || event.metadata.locationId !== locationId) throw new Error("That draft is not available here.");
      const resolved = await resolveEventAction(tenantId, eventId, action === "approve" ? "approved" : "dismissed", actor.userId);
      result = resolved.changed ? (action === "approve" ? resolved.reason === "already_on_google" ? "Google already matches. Nothing was sent." : resolved.reason ? "Google accepted the change; confirmation is still pending. See its receipt below." : "Google accepted the change. See its receipt below." : "Declined. Nothing was sent.") : resolved.reason ?? "The draft remains waiting. Nothing was sent again.";
    } else if (action === "reply" || action === "withdraw") {
      const outcome = await changeWorkspaceGoogleReply(actor, { workspaceId, tenantId, locationId, commandId: z.string().uuid().parse(form.get("commandId")), reviewId: z.string().regex(/^[A-Za-z0-9_-]{1,300}$/).parse(form.get("reviewId")), text: String(form.get("replyText") ?? ""), withdraw: action === "withdraw" });
      result = outcome.message;
    } else if (action === "undo") {
      const outcome = await undoWorkspaceGoogleChange(actor, { workspaceId, tenantId, locationId, receiptId: z.string().uuid().parse(form.get("receiptId")) });
      result = outcome.message;
    } else if (action === "hours" || action === "info" || action === "post") {
      const topicType = form.get("topicType") ?? "STANDARD";
      const text = (key: string) => String(form.get(key) ?? "").trim();
      const post = action === "post" ? { topicType, summary: text("summary"), ...(text("actionType") ? { callToAction: { actionType: text("actionType"), ...(text("ctaUrl") ? { url: text("ctaUrl") } : {}) } } : {}), ...(topicType !== "STANDARD" ? { event: { title: text("eventTitle"), startDate: text("startDate"), endDate: text("endDate") } } : {}), ...(topicType === "OFFER" ? { offer: { couponCode: text("couponCode"), ...(text("redeemOnlineUrl") ? { redeemOnlineUrl: text("redeemOnlineUrl") } : {}), termsConditions: text("termsConditions") } } : {}) } : undefined;
      const { googleDraftInputSchema } = await import("@/products/google-listing/server");
      await prepareGoogleListingDraft(actor, googleDraftInputSchema.parse({ workspaceId, tenantId, locationId, kind: action, post }));
      result = "Draft kept. Review the exact change below before approving.";
    } else throw new Error("Choose a supported Google action.");
  } catch (error) {
    result = error instanceof Error ? error.message.slice(0, 200) : "Nothing was sent. Try again later.";
  }
  redirect(`/workspace/google?${new URLSearchParams({ workspaceId, result })}`);
}
