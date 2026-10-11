import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import type { WebsitePublicationReadbackPort } from "@/lib/workspace-ports";

/** App-edge composition: accepted content writes cannot become retryable because an observation failed. */
export const observeAcceptedNativePublish: WebsitePublicationReadbackPort["observeAcceptedNativePublish"] = async (input) => {
  if (!releaseFlagMayBeOn("systems") || !releaseFlagMayBeOn("make_real_live:tenant_content")) return;
  const [{ tenantReleaseFlagEnabled }, { currentReleaseViewer }] = await Promise.all([
    import("@/platform/release-flags/store"), import("@/platform/release-flags/viewer"),
  ]);
  const viewer = await currentReleaseViewer();
  const enabled = async () => await tenantReleaseFlagEnabled("systems", input.tenantId, viewer)
    && await tenantReleaseFlagEnabled("make_real_live:tenant_content", input.tenantId, viewer);
  // Unconfirmed rollout authority never starts an observation or a new event.
  try { if (!await enabled()) return; } catch { return; }
  // Preserve legacy fire-and-forget revalidation when observation is off.
  try { await input.revalidation; } catch { /* Observe the accepted content separately. */ }
  try { if (!await enabled()) return; } catch { return; }

  let observation: Record<string, unknown>;
  try {
    const [{ getTenantConfig }, { readPublishedWebsiteContent }] = await Promise.all([
      import("@/lib/tenants"), import("@/products/websites/index"),
    ]);
    const tenant = await getTenantConfig(input.tenantId);
    observation = { ...await readPublishedWebsiteContent({ tenant: tenant ?? {}, section: input.section, expected: input.expected }) };
  } catch {
    observation = { ok: false, status: "unverified", checkedAt: new Date().toISOString(), detail: "Publication is accepted. Public read-back could not be confirmed; do not republish automatically." };
  }
  const metadata = { ...observation, section: input.section, actorId: input.actorId, publicationRef: input.publicationRef ?? null, publicationAccepted: true };
  try {
    const { logAuditEvent } = await import("@/lib/storage");
    await logAuditEvent({ tenant: input.tenantId, actor: { userId: null, email: null, type: "system", isSuperAdmin: false },
      action: "content.public_read_back", targetType: "content_section", targetId: input.section, metadata });
  } catch { /* An audit storage failure cannot erase publication acceptance. */ }
  if (observation.ok !== true) {
    try {
      const { addEvent } = await import("@/lib/events");
      await addEvent({ tenantId: input.tenantId, source: "website", type: "change_verify_failed", status: "pending",
        title: `${input.section} publication needs a public check`, body: String(observation.detail),
        metadata: { ...metadata, reviewAudience: "operator", kind: "native_public_read_back" } });
    } catch { /* A failed observation is bookkeeping, never another publish. */ }
  }
};
