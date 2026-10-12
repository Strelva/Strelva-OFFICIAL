import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { BUSINESS_START_PRODUCTS } from "@/platform/workspaces/business-start";
import { StCopy, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import { readSetupCheck } from "./check-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your business", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function BusinessSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const query = await searchParams;
  const start = z.enum(BUSINESS_START_PRODUCTS).safeParse(query.start || "help");
  if (!start.success) notFound();
  const checkId = typeof query.check === "string" ? query.check : undefined;
  if (query.check !== undefined && !checkId) notFound();
  const check = checkId ? await readSetupCheck(checkId).catch(() => null) : null;
  return <StrelvaShell title="Your business"><StPage>{checkId && !check ? <><StNotice tone="need">This check is unavailable. Run the free check again to carry its evidence and fix into your business.</StNotice><StTextButton href="/audit">Check your business</StTextButton></> : <>{check ? <StCopy>Your check and its first fix come with you. Choose the business that owns this work.</StCopy> : null}<BusinessSetupPanel key={`${start.data}:${checkId ?? ""}`} startProduct={start.data} initialRequest={check?.request} initialName={check?.businessName} sourceCheckId={checkId} /></>}</StPage></StrelvaShell>;
}
