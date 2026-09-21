"use client";

import Link from "next/link";
import { ServiceRequestInbox as ReviewInbox } from "./ServiceRequestReviewInbox";

export function ServiceRequestInbox(props: { providerWorkspaceId?: string; surface?: "admin" | "workspace" }) {
  const href = props.providerWorkspaceId ? `/workspace/delivery?providerWorkspaceId=${encodeURIComponent(props.providerWorkspaceId)}` : "/workspace/delivery?providerKind=strelva";
  return <div className="space-y-4"><Link href={href}>Open accepted deliveries and deadlines</Link><ReviewInbox {...props} /></div>;
}
