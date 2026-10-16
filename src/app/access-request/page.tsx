import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { CHECK_RESULT_ID } from "@/products/getting-started/contracts";
import { gettingStarted } from "@/products/getting-started/server";

export const metadata: Metadata = {
  title: "Open your account or choose an agency",
  description:
    "Open your business or agency account on Strelva, or choose an agency to do the work.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Owner door: the check that sent the person here already has their name and website.
  const scan = businessSignupReleaseEnabled() && typeof params.scan === "string" && CHECK_RESULT_ID.test(params.scan) ? params.scan : null;
  const check = scan ? await gettingStarted.readCheck(scan).catch(() => null) : null;
  return <AccessRequestPage businessOpen={businessSignupReleaseEnabled()} agencyOpen={agencySignupReleaseEnabled()}
    carried={check ? { businessName: check.name ?? undefined, currentWebsite: check.website ?? undefined, scan: scan ?? undefined } : undefined} />;
}
