import { z } from "zod";
import { tool } from "ai";
import type { ContentSection } from "../types";
import type { ChatToolDeps, ChatToolEntries } from "./chat-tool-deps";

// Tenant chat tools that read and change site content, and the CMS
// collection tools. Part of buildTenantChatTools (./chat-tools.ts); the bodies are
// the ones that used to live inline there, unchanged.

function getCustomRequestUrl(productionUrl: string | undefined, endpoint: string | undefined): string | null {
  if (!productionUrl || !endpoint) return null;
  try {
    const base = new URL(productionUrl);
    const resolved = new URL(endpoint, base);
    // SAME-ORIGIN ONLY. `endpoint` comes from the (editor-writable) capability
    // manifest; an absolute value pointing off the client's own production
    // origin would send the shared platform SCAFFOLD_CUSTOM_REQUEST_SECRET
    // bearer to an arbitrary host, which could then forge requests against every
    // other client's repo. Reject anything that isn't the client's own origin.
    if (resolved.origin !== base.origin) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/** Site content: v2 document, sections, undo, custom changes, images. */
export function contentChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant, tenantConfig, siteManifest, sectionEnum, recordActionResult, ctx, undoTool, documentTools, mods: { sniffImageType, manifestAllowsAction, applySectionUpdate, postCustomChangeRequest, logger } } = deps;
  return {
    read_site: { capability: "read_site", def: documentTools.read_site },
    patch_site: { capability: "patch_site", def: documentTools.patch_site },
    read_section: {
      capability: "read_section",
      def: tool({
        description: "Read current content for a website section",
        inputSchema: z.object({ section: sectionEnum }),
        execute: async ({ section }) => {
          try {
            if (!manifestAllowsAction(siteManifest, section, "read")) {
              return { error: `${section} is not readable for this site's capability manifest` };
            }
            const { getContent } = await import("@/lib/storage");
            return await getContent(section as ContentSection, tenant);
          } catch (err) {
            return { error: `Failed to read ${section}: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
    update_section: {
      capability: "update_section",
      def: tool({
        description: "Update content for a website section. Always read the section first, then send the COMPLETE updated data.",
        inputSchema: z.object({
          section: sectionEnum,
          data: z.record(z.string(), z.unknown()),
        }),
        execute: async ({ section, data }) => {
          try {
            const result = await applySectionUpdate({
              tenantId: tenant,
              section: section as ContentSection,
              data: data as Record<string, unknown>,
              tenantConfig: tenantConfig ?? null,
              siteManifest,
              // Ask Strelva sets this until the Needs you policy decides auto-publish.
              ...(ctx.forceReview ? { forceReview: true } : {}),
            });

            if (result.status === "failed") {
              recordActionResult({ status: "failed", sectionIds: [section], error: result.error });
              return { success: false, error: result.error, section, agentResultStatus: "failed" as const };
            }
            if (result.status === "blocked") {
              recordActionResult({ status: "blocked", sectionIds: [section], message: result.message });
              return {
                success: false,
                blocked: true,
                section,
                message: result.message,
                reason: result.reason,
                agentResultStatus: "blocked" as const,
                risk: result.risk,
                diffs: result.diffs,
              };
            }

            const autoPublish = result.status === "published";
            const sourceProof = "Source: Current site content, capability manifest, and AI governance rules";
            const message = autoPublish
              ? `Updated ${section} successfully`
              : `I've queued these changes to ${section} for review. They'll go live after approval.`;

            // Slack (route copy): includes the risk label + a short change summary.
            if (process.env.SLACK_WEBHOOK_URL) {
              const changeSummary = result.changes
                .slice(0, 5)
                .map((c) => `  • ${c.field}: "${c.before}" → "${c.after}"`)
                .join("\n");
              const tenantLabel = tenantConfig?.siteName || tenant;
              const riskLabel = result.risk.level !== "low" ? ` [${result.risk.level.toUpperCase()} RISK]` : "";
              fetch(process.env.SLACK_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: autoPublish
                    ? `[${tenantLabel}] AI updated *${section}*${riskLabel}\n${changeSummary}`
                    : `[${tenantLabel}] AI drafted changes to *${section}*${riskLabel} — needs review at /admin/drafts\nReason: ${result.governance.reason}\n${changeSummary}`,
                }),
              }).catch(() => {});
            }

            const eventId = result.status === "queued" ? result.eventId : undefined;
            recordActionResult({
              status: autoPublish ? "published" : "queued",
              sectionIds: [section],
              eventIds: eventId ? [eventId] : undefined,
              message,
              sourceProof,
            });

            return {
              success: true,
              section,
              sectionIds: [section],
              eventId,
              eventIds: eventId ? [eventId] : undefined,
              governance: result.governance,
              risk: result.risk,
              diffs: result.diffs,
              applied: autoPublish,
              agentResultStatus: autoPublish ? ("published" as const) : ("queued" as const),
              message,
              sourceProof,
            };
          } catch (err) {
            const error = `Failed to update ${section}: ${err instanceof Error ? err.message : "Unknown error"}`;
            recordActionResult({ status: "failed", sectionIds: [section], error });
            return { success: false, error, section, agentResultStatus: "failed" as const };
          }
        },
      }),
    },
    // undo_last_change shares its definition with the executor (buildUndoTool).
    undo_last_change: { capability: "undo_last_change", def: undoTool },
    request_custom_change: {
      capability: "request_custom_change",
      def: tool({
        description: "Queue a custom-code or custom-design request for a manifest custom-only feature such as cart, rewards, checkout, product-modal, email-popup, or chat.",
        inputSchema: z.object({
          feature: z.string().describe("The custom-only feature id from the site capability manifest"),
          summary: z.string().describe("Plain-English summary of the requested custom behavior or design change"),
        }),
        execute: async ({ feature, summary }) => {
          const normalizedFeature = feature.trim();
          const cleanSummary = summary.trim();
          if (!siteManifest.customOnlyFeatures.includes(normalizedFeature)) {
            const message = `${normalizedFeature} is not listed as a custom-only feature for this site's capability manifest.`;
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }
          if (!cleanSummary) {
            const message = "A custom request summary is required.";
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }

          // Care-plan rule: one active custom request at a time. If the owner
          // already has a request in flight, don't stack a second — tell them
          // what's pending and let them choose to fold this in or wait.
          //
          // Atomic NX lock around check-and-create to close the TOCTOU race:
          // two concurrent submits could both read "no open request" before
          // either writes, creating two pending events and breaking the
          // one-active-request invariant. Whoever loses the lock returns the
          // same "already has a request" response the reader-path returns.
          const { getRedis } = await import("@/platform/infra/redis");
          const redis = getRedis();
          const customRequestLockKey = `reb:custom-request-lock:${tenant}`;
          if (redis) {
            const acquired = await redis.set(customRequestLockKey, "1", { nx: true, ex: 10 });
            if (!acquired) {
              const message =
                "You already have a custom request in progress, " +
                "and we keep it to one at a time so nothing falls through the cracks. " +
                "Want me to add this to that one, or hold it until the first wraps up?";
              recordActionResult({ status: "blocked", message });
              return { success: false, blocked: true, reason: "active_request_exists", message, agentResultStatus: "blocked" as const };
            }
          }

          let customRequestLockReleased = false;
          const releaseCustomRequestLock = async () => {
            if (redis && !customRequestLockReleased) {
              customRequestLockReleased = true;
              try { await redis.del(customRequestLockKey); } catch {}
            }
          };

          try {
          const { getOpenChangeRequest } = await import("@/lib/events");
          const openRequest = await getOpenChangeRequest(tenant);
          if (openRequest) {
            await releaseCustomRequestLock();
            const requestedAt =
              (openRequest.metadata?.requestedAt as string | undefined) ?? openRequest.createdAt;
            const message =
              `You already have a custom request in progress ("${openRequest.title}"), ` +
              "and we keep it to one at a time so nothing falls through the cracks. " +
              "Want me to add this to that one, or hold it until the first wraps up?";
            recordActionResult({
              status: "blocked",
              eventIds: [openRequest.id],
              message,
            });
            return {
              success: false,
              blocked: true,
              reason: "active_request_exists",
              activeRequest: { id: openRequest.id, title: openRequest.title, requestedAt },
              message,
              agentResultStatus: "blocked" as const,
            };
          }

          const requestUrl = getCustomRequestUrl(
            tenantConfig?.customRepo?.productionUrl || tenantConfig?.siteUrl,
            siteManifest.customRequestEndpoint
          );
          // Prefer SCAFFOLD_* env names; fall back to legacy REB_* so deployed
          // custom repos that still set the old name keep working.
          const secret =
            process.env.SCAFFOLD_CUSTOM_REQUEST_SECRET ??
            process.env.REB_CUSTOM_REQUEST_SECRET;
          if (!requestUrl || !secret) {
            await releaseCustomRequestLock();
            const message = "Custom requests are not fully configured for this site yet.";
            recordActionResult({ status: "blocked", message });
            return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
          }
          try {
            const postResult = await postCustomChangeRequest({
              url: requestUrl,
              secret,
              feature: normalizedFeature,
              summary: cleanSummary,
            });
            if (!postResult.ok) {
              await releaseCustomRequestLock();
              if (postResult.reason === "unsafe_url") {
                const message = "Custom request endpoint is not a safe external URL.";
                recordActionResult({ status: "blocked", message });
                return { success: false, blocked: true, message, agentResultStatus: "blocked" as const };
              }
              const message =
                postResult.reason === "http_error"
                  ? `Custom request failed with ${postResult.status}.`
                  : `Failed to send custom request: ${postResult.error}`;
              recordActionResult({ status: "failed", message });
              return { success: false, error: message, agentResultStatus: "failed" as const };
            }

            // Mirror the dashboard change-request route: record a pending
            // `change_request` event so both the chat path and the dashboard
            // panel share one queue state and the one-active-request wall trips
            // on either path. Event creation is best-effort — the custom repo
            // already accepted the request, so a queue-write failure must not
            // fail the tool.
            let queuedEventId: string | undefined;
            try {
              const { addEvent } = await import("@/lib/events");
              const { getCustomRepoMetadata, getTenantDeliveryModel, getTriageDueAt } =
                await import("@/lib/custom-repos");
              const deliveryModel = getTenantDeliveryModel(tenantConfig);
              const customRepo = getCustomRepoMetadata(tenantConfig);
              const requestedAt = new Date();
              const queued = await addEvent({
                tenantId: tenant,
                source: "ai",
                type: "change_request",
                title: `Requested custom ${normalizedFeature} change`,
                body: cleanSummary,
                status: "pending",
                metadata: {
                  feature: normalizedFeature,
                  kind: "custom_code_or_design_request",
                  requestKind: "custom_design",
                  workflowStatus: "requested",
                  workflowHistory: [{ status: "requested", actor: "customer", at: requestedAt.toISOString() }],
                  requestedAt: requestedAt.toISOString(),
                  triageDueAt: getTriageDueAt(requestedAt),
                  deliveryModel,
                  customRepo: deliveryModel === "custom_repo" ? {
                    repoName: customRepo.repoName,
                    repoUrl: customRepo.repoUrl,
                    localPath: customRepo.localPath,
                    productionUrl: customRepo.productionUrl,
                    contractVersion: customRepo.contractVersion,
                  } : undefined,
                  complexity: "unclear",
                  quoteRequired: true,
                  requestedVia: "ai_agent",
                },
              });
              queuedEventId = queued.id;
            } catch (err) {
              logger.error("[agent request_custom_change] failed to queue change_request event", {
                error: err instanceof Error ? err.message : String(err),
              });
            }

            // Lock is released after addEvent so no second submit can race into
            // addEvent before the first event is written.
            await releaseCustomRequestLock();

            const message = `Custom ${normalizedFeature} request sent for review.`;
            recordActionResult({
              status: "queued",
              eventIds: queuedEventId ? [queuedEventId] : undefined,
              message,
            });
            return {
              success: true,
              feature: normalizedFeature,
              requestUrl,
              eventId: queuedEventId,
              eventIds: queuedEventId ? [queuedEventId] : undefined,
              agentResultStatus: "queued" as const,
              message,
            };
          } catch (err) {
            await releaseCustomRequestLock();
            const error = `Failed to send custom request: ${err instanceof Error ? err.message : "Unknown error"}`;
            recordActionResult({ status: "failed", error });
            return { success: false, error, agentResultStatus: "failed" as const };
          }
          } finally {
            // Ensure the lock is always released even if an unexpected return path
            // (e.g. a thrown error from getOpenChangeRequest) skips the above.
            await releaseCustomRequestLock();
          }
        },
      }),
    },
    upload_image: {
      capability: "upload_image",
      def: tool({
        description: "Upload an image to the website. Use when the client shares a photo or wants to add an image to their site.",
        inputSchema: z.object({
          imageData: z.string().describe("Base64-encoded image data URL (e.g. data:image/jpeg;base64,...)"),
          filename: z.string().optional().describe("Desired filename for the image"),
        }),
        execute: async ({ imageData, filename }) => {
          try {
            const match = imageData.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) {
              return { success: false, error: "Invalid image data. Expected a base64-encoded data URL (data:image/type;base64,...)." };
            }
            const buffer = Buffer.from(match[2]!, "base64");

            // Size cap: a base64 string from the model is unbounded, so cap the
            // decoded buffer at 5MB (parity with MAX_FILE_SIZE in upload-store
            // and MAX_SIZE in /api/media). Reject cleanly instead of throwing.
            const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
            if (buffer.byteLength > MAX_UPLOAD_SIZE) {
              return { success: false, error: "Image too large (max 5MB)." };
            }

            // Defense in depth: verify the bytes are actually a raster image of
            // an allowed type (mirrors the /api/media allowlist) so a mislabeled
            // data URL — e.g. an SVG smuggled as image/png — can't slip through.
            const sniffed = sniffImageType(buffer);
            if (!sniffed) {
              return { success: false, error: "Invalid image. Allowed: JPEG, PNG, WebP, GIF, AVIF." };
            }

            const ext = match[1]!.split("/")[1] ?? "png";
            const finalFilename = filename || `upload-${Date.now()}.${ext}`;
            const { uploadTenantMedia } = await import("@/lib/media-store");
            const asset = await uploadTenantMedia(tenant, buffer, finalFilename, sniffed);
            return { success: true, url: asset.url, filename: finalFilename };
          } catch (err) {
            return { success: false, error: `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
  };
}

/** CMS collection entries (blog, video, product). Always drafts. */
export function collectionChatTools(deps: ChatToolDeps): ChatToolEntries {
  const { tenant } = deps;
  return {
    list_entries: {
      capability: "list_entries",
      def: tool({
        description:
          "List CMS collection entries (blog posts, videos, or products) for this site. Use this to see what already exists before creating or editing one.",
        inputSchema: z.object({
          type: z.enum(["blog", "video", "product"]),
          status: z.enum(["draft", "published"]).optional(),
        }),
        execute: async ({ type, status }) => {
          try {
            const { listEntriesForType } = await import("@/lib/cms/collections-service");
            const entries = await listEntriesForType(tenant, type, status ? { status } : undefined);
            return {
              entries: entries.map((e) => ({
                slug: e.slug,
                status: e.status,
                data: e.data,
                updatedAt: e.updated_at,
              })),
            };
          } catch (err) {
            return { error: `Failed to list ${type} entries: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
    save_entry: {
      capability: "save_entry",
      def: tool({
        description:
          "Create or update a CMS collection entry (a blog post, video, or product). Provide the type and the entry fields in `data` (e.g. blog: title, excerpt, body, tags). The slug is derived from the title if omitted. AI-authored entries are saved as DRAFTS for the owner to review and publish.",
        inputSchema: z.object({
          type: z.enum(["blog", "video", "product"]),
          data: z.record(z.string(), z.unknown()),
          slug: z.string().optional(),
        }),
        execute: async ({ type, data, slug }) => {
          try {
            const { saveEntry } = await import("@/lib/cms/collections-service");
            // Governance: the agent drafts; a human publishes from the editor.
            const result = await saveEntry({
              tenant,
              type,
              data: data as Record<string, unknown>,
              slug,
              status: "draft",
              actor: "ai",
            });
            if (!result.ok) return { success: false, error: result.error };
            return {
              success: true,
              slug: result.entry.slug,
              status: result.entry.status,
              message: `Saved a draft ${type} entry "${result.entry.slug}". It will go live after you publish it.`,
            };
          } catch (err) {
            return { success: false, error: `Failed to save ${type} entry: ${err instanceof Error ? err.message : "Unknown error"}` };
          }
        },
      }),
    },
  };
}
