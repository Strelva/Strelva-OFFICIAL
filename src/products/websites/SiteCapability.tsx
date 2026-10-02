"use client";

import { StrelvaConnectedInquiryForm } from "../../../custom-repo-starter/StrelvaInquiryForm";
import { StrelvaConnectedBookingForm } from "../../../custom-repo-starter/StrelvaBookingForm";
import type { WebsitePublishedCapabilities } from "./contracts";

/** Reuses the native public clients; the catalog cannot invent provider endpoints. */
export function SiteCapability({ kind, config }: { kind: "inquiry" | "booking"; config: WebsitePublishedCapabilities }) {
  if (kind === "inquiry" && config.inquiry) return <StrelvaConnectedInquiryForm baseUrl={config.baseUrl} tenant={config.tenant} capabilityId={config.inquiry.capabilityId} expectedVersion={config.inquiry.version} />;
  if (kind === "booking" && config.booking) return <StrelvaConnectedBookingForm baseUrl={config.baseUrl} tenant={config.tenant} capabilityId={config.booking.capabilityId} expectedVersion={config.booking.version} range={config.booking.range} />;
  return <p role="status">This capability is not connected yet.</p>;
}
