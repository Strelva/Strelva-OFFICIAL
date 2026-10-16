import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { legacyState } from "@/experience/workspace/preview/legacy-dashboard-fixtures";
import { LegacyDashboardScreen } from "@/experience/workspace/preview/LegacyDashboardScreens";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Website dashboard (XA)", robots: { index: false, follow: false } };

/**
 * The legacy website dashboard (admin.<tenant>/dashboard) rebuilt in XA, with
 * fixtures. `/preview/strelva/xa/xs-legacy-dashboard/<screen>` or
 * `.../dashboard/<screen>` (the shell's own links). `?state=ready|empty|loading|error|waiting|done`, `&mode=dark`.
 */
export default async function LegacyDashboardPreviewPage({ params, searchParams }: { params: Promise<{ screen: string[] }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const query = await searchParams;
  const path = (screen[0] === "dashboard" ? screen.slice(1) : screen).join("/") || "today";
  return <LegacyDashboardScreen screen={path} state={legacyState(query.state)} mode={query.mode === "dark" ? "dark" : "light"} query={query} />;
}
