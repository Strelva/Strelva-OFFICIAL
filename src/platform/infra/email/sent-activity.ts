/**
 * Log a real client-comms send into the tenant's operator CRM activity timeline
 * so comms history accrues automatically ("Sent: welcome email"). Called ONLY
 * after a send actually goes out — every sender returns early (false) when
 * paused or missing an API key, so a suppressed send is never recorded as sent.
 * A no-op when no `tenantId` is passed. Fail-soft by contract: a CRM-log failure
 * must never break the send, so it swallows every error.
 */
export async function logSentEmailToCrm(
  tenantId: string | undefined,
  summary: string,
): Promise<void> {
  if (!tenantId) return;
  try {
    const { addTenantActivity } = await import("@/platform/infra/tenant-crm");
    await addTenantActivity(tenantId, { kind: "email", summary, author: "Strelva" });
  } catch (err) {
    console.error("[delivery-email] CRM comms log failed (non-fatal):", err);
  }
}

