import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { BUSINESS_START_PRODUCTS } from "@/lib/business-start";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your business", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function BusinessSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const query = await searchParams;
  const start = z.enum(BUSINESS_START_PRODUCTS).safeParse(query.start || "help");
  if (!start.success) notFound();
  return <StrelvaShell title="Your business"><div className="mx-auto w-full max-w-2xl p-6"><BusinessSetupPanel key={start.data} startProduct={start.data} /></div></StrelvaShell>;
}
