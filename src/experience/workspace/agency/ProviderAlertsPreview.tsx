"use client";
import { AgencyQueueList } from "./AgencyViews";
import type { AgencyQueueItem } from "../agency-clients";

const business = "27100000-0000-4000-8000-000000000010";
const system = "27100000-0000-4000-8000-000000000050";
export const PROVIDER_ALERT_PREVIEW_TIME = Date.parse("2026-10-08T16:00:00Z");
export function providerAlertPreviewRows(): AgencyQueueItem[] {
  return [
    ["down", "lakebakery.example.test is unreachable.", "Domain"],
    ["ssl", "lakebakery.example.test SSL certificate expires in 7 days.", "SSL expiry"],
    ["calendar", "Booking calendar needs reconnecting (error).", "Booking calendar"],
    ["readback", "Google accepted reply_post; read-back failed. Do not resend.", "Read-back failed"],
    ["verification", "lakebakery.example.test still needs domain verification (pending).", "Domain verification"],
  ].map(([id, title, label], index) => ({ id: `provider:${id}`, kind: "health", workspaceId: business, clientName: "Lake Bakery (fictional)",
    title: title!, label, systemId: system, workId: null, since: new Date(PROVIDER_ALERT_PREVIEW_TIME - (index + 1) * 86_400_000).toISOString(),
    href: `/workspace?view=system&workspaceId=${business}&system=${system}` }));
}
/** Reuses the production row component. Clicking a row follows its existing
 * workspace URL; no test action, email or provider command is created here. */
export function ProviderAlertsPreview({ state }: { state: string }) {
  return <>
    {state === "missing" && <p role="alert" className="mb-4 text-sm text-gray-muted">Provider domain evidence is missing or stale. Provider website health could not be read.</p>}
    <AgencyQueueList items={state === "empty" || state === "revoked" ? [] : providerAlertPreviewRows()}
      now={PROVIDER_ALERT_PREVIEW_TIME} onWorkspace={() => undefined} onOpenClientWork={() => undefined} />
  </>;
}
