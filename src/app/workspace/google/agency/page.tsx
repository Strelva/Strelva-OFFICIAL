import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AgencyGooglePicker, type AgencyGoogleResult, type AgencyGooglePickerProps } from "@/experience/places/AgencyGooglePicker";
import { AGENCY_GOOGLE_CHOICES_COOKIE, admitAgencyGoogleConnect, readDiscoveryChoices } from "@/products/google-listing/server";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { AgencyGoogleFrame } from "@/experience/places/AgencyGoogleFrame";
import { XaButtonLink, XaHeadline, XaSays } from "@/components/ui/strelva/Xa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your agency’s Google account", robots: { index: false, follow: false }, referrer: "no-referrer" };
const statuses = z.enum(["expired", "forbidden", "unavailable", "access_pending", "no_listings", "refused"]);
export default async function AgencyGooglePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const id = z.string().uuid().safeParse(params.workspaceId);
  const actor = await workspaceHttpActor();
  if (!actor) redirect(`/sign-in?${new URLSearchParams({ next: id.success ? `/workspace/google/agency?workspaceId=${id.data}` : "/workspace" })}`);
  let choices: AgencyGooglePickerProps["choices"] = null;
  let result: AgencyGoogleResult | undefined;
  if (id.success && workspaceReleaseEnabled()) {
    try {
      // Re-read current ordinary agency authority before exposing listing choices.
      await admitAgencyGoogleConnect(actor, id.data);
      const signed = readDiscoveryChoices(actor, id.data, (await cookies()).get(AGENCY_GOOGLE_CHOICES_COOKIE)?.value);
      choices = signed ? { googleEmail: signed.googleEmail, listings: signed.listings, more: signed.more } : null;
      const parsed = statuses.safeParse(params.result);
      result = choices ? undefined : parsed.success ? parsed.data : "expired";
    } catch (error) { result = error instanceof WorkspaceAccessError ? "forbidden" : "unavailable"; }
  }
  return <AgencyGoogleFrame>
    {id.success && workspaceReleaseEnabled() ? <AgencyGooglePicker workspaceId={id.data} choices={choices} result={result} /> : <>
      <XaHeadline quiet="Nothing on the listing changed.">This Google sign-in stopped.</XaHeadline>
      <div role="alert"><XaSays>This Google sign-in is unavailable or has expired. Open the business’s Google listing and start again.</XaSays></div>
      <div><XaButtonLink href="/workspace" variant="secondary">Back to your workspace</XaButtonLink></div>
    </>}
  </AgencyGoogleFrame>;
}
