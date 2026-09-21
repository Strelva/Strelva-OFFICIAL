"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { analyticsAllowedPath } from "@/lib/analytics-privacy";

/** Invitation fragments and private workspace navigation are excluded from analytics. */
export function PrivacyAwareAnalytics() {
  const pathname = usePathname();
  if (!analyticsAllowedPath(pathname)) return null;
  return <Analytics />;
}
