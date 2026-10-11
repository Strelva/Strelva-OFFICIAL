"use client";
import { useCallback } from "react";
import { RecordPublishingFields } from "@/experience/publishing/RecordPublishingFields";
import { recordGoogleApprovalCopy } from "@/products/publishing/client";
import type { BusinessRecord } from "@/platform/business-record/contracts";

const record: BusinessRecord = { workspaceId: "5e000000-0000-4000-8000-000000000010", access: "owner", revision: 1, lastSequence: 1, updatedAt: null, services: [], people: [], contactCount: 0,
  facts: { hours: { value: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-11-27", closed: true }] }, source: "owner", verified: true, updatedAt: "2026-10-07T12:00:00Z", updatedBy: "5e000000-0000-4000-8000-000000000001" } } };

/** Fictional HTTP double. Saving never reaches a record, Google or email. */
export function PublishingRecordPreview({ state }: { state: string }) {
  const request = useCallback<typeof fetch>(async (_url, options) => {
    if (state === "error") return Response.json({ error: "Storage is unavailable. Your edits are kept; no change is confirmed." }, { status: 503 });
    const command = JSON.parse(String(options?.body)) as { revision: number };
    return Response.json({ result: { record: { revision: command.revision + 1, changeCount: 1 }, google: state === "policy" || state === "partial"
      ? [{ tenantId: "juniper", locationId: "Buffalo", kind: "hours", status: "posted" }, { tenantId: "juniper", locationId: "Amherst", kind: "hours", status: "failed", reason: "Waiting for Google to approve API access. Nothing was sent to this listing." }]
      : [{ tenantId: "juniper", locationId: "Buffalo", kind: "hours", status: "needs_approval" }] } });
  }, [state]);
  return <main className="mx-auto max-w-3xl p-6"><RecordPublishingFields record={record} approvalCopy={recordGoogleApprovalCopy(record, state === "policy" || state === "partial")} readOnly={state === "read_only"} request={request} /></main>;
}
