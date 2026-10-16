import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { entryAccountName } from "@/experience/getting-started/entry-account";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { BUSINESS_START_PRODUCTS } from "@/platform/workspaces/business-start";
import { StCopy, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
import { BusinessDoor } from "@/experience/getting-started/BusinessDoor";
import { readSetupCheck } from "./check-context";
import { CHECK_RESULT_ID } from "@/products/getting-started/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your business", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function BusinessSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!workspaceReleaseEnabled()) notFound();
  const query = await searchParams;
  const start = z.enum(BUSINESS_START_PRODUCTS).safeParse(query.start || "help");
  if (!start.success) notFound();
  const checkId = typeof query.check === "string" ? query.check : undefined;
  if (query.check !== undefined && !checkId) notFound();
  if (checkId && !CHECK_RESULT_ID.test(checkId)) notFound();
  // Old check links use the same check-to-business path as the public CTA.
  if (checkId && businessSignupReleaseEnabled()) redirect(`/workspace?save=${encodeURIComponent(checkId)}`);
  // XA · B2: the owner door opens in the entry frame, before the business has a workspace.
  if (businessSignupReleaseEnabled() && start.data === "help" && !checkId) {
    const account = entryAccountName(await getSessionUser().catch(() => null));
    return <BusinessDoor account={account} />;
  }
  const check = checkId ? await readSetupCheck(checkId).catch(() => null) : null;
  return <StrelvaShell title="Your business"><StPage>{checkId && !check ? <><StNotice tone="need">This check is unavailable. Run the free check again to carry its evidence and fix into your business.</StNotice><StTextButton href="/audit">Check your business</StTextButton></> : <>{check ? <StCopy>Your check and its first fix come with you. Choose the business that owns this work.</StCopy> : null}<BusinessSetupPanel key={`${start.data}:${checkId ?? ""}`} startProduct={start.data} initialRequest={check?.request} initialName={check?.businessName} sourceCheckId={checkId} gettingStarted={businessSignupReleaseEnabled()} /></>}</StPage></StrelvaShell>;
}
