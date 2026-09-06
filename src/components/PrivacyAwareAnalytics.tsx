"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";

/** Invitation fragments and private workspace navigation are excluded from analytics. */
export function PrivacyAwareAnalytics() {
  const pathname = usePathname();
  if (!pathname || pathname === "/workspace" || pathname.startsWith("/workspace/")) return null;
  return <Analytics />;
}
