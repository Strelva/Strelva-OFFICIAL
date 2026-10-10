"use client";

import Link from "next/link";
import { ServiceRequestInbox as ReviewInbox } from "./ServiceRequestReviewInbox";

export function ServiceRequestInbox(props: { providerWorkspaceId?: string; surface?: "admin" | "workspace" }) {
  if (!props.providerWorkspaceId) return <p>Provider work lives in the chosen agency workspace. <Link href="/workspace">Open an agency workspace</Link>. Platform support does not accept client work through operator access.</p>;
  const href = `/workspace/delivery?providerWorkspaceId=${encodeURIComponent(props.providerWorkspaceId)}`;
  return <div className="space-y-4"><Link href={href}>Open accepted deliveries and deadlines</Link><ReviewInbox {...props} /></div>;
}
