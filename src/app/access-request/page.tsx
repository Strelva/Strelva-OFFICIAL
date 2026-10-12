import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";
import { CHECK_RESULT_ID } from "@/products/getting-started/contracts";
import { gettingStarted } from "@/products/getting-started/server";

export const metadata: Metadata = {
  title: "Request your build",
  description:
    "Strelva Agency builds your site, manages it for you, and sends a weekly plain-English recap. You own everything. Runs on Strelva.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Owner door: the check that sent the person here already has their name and website.
  const scan = businessSignupReleaseEnabled() && typeof params.scan === "string" && CHECK_RESULT_ID.test(params.scan) ? params.scan : null;
  const check = scan ? await gettingStarted.readCheck(scan).catch(() => null) : null;
  return <AccessRequestPage carried={check ? { businessName: check.name ?? undefined, currentWebsite: check.website ?? undefined } : undefined} />;
}
