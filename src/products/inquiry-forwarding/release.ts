/**
 * Forward your inquiries is off unless all of these hold:
 *   - STRELVA_INQUIRY_FORWARDING_RELEASE is exactly `1`;
 *   - the inquiries release could be on (STRELVA_INQUIRIES_RELEASE), and is on
 *     for the business (its `inquiries` row under the workspace release);
 *   - durable inquiry records are on (STRELVA_INQUIRY_RECORDS=1): forwarded
 *     inquiries exist only in Postgres;
 *   - the inbound domain (INQUIRY_REPLY_TO_DOMAIN) is configured.
 * Exposure only: every read and command is rechecked in SQL.
 */
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import type { ReleaseEnvironment, ReleaseViewer } from "@/platform/release-flags/resolve";
import { inquiryReleaseEnabledForWorkspace, inquiryReleaseMayBeOn } from "@/products/inquiries/release";
import { forwardingDomain } from "./contracts";

export function inquiryForwardingReleaseEnabled(environment: ReleaseEnvironment = process.env): boolean {
  return environment.STRELVA_INQUIRY_FORWARDING_RELEASE?.trim() === "1"
    && inquiryRecordsEnabled(environment)
    && inquiryReleaseMayBeOn(environment)
    && forwardingDomain(environment) !== null;
}

/** Per business, layered on its inquiries release. */
export async function inquiryForwardingReleasedFor(workspaceId: string, viewer?: ReleaseViewer, environment: ReleaseEnvironment = process.env): Promise<boolean> {
  if (!inquiryForwardingReleaseEnabled(environment)) return false;
  return inquiryReleaseEnabledForWorkspace(workspaceId, viewer, environment);
}
