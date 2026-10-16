import { XaEmpty } from "@/components/ui/strelva/Xa";
import { XaOutside } from "@/components/ui/strelva/Xa";
import { headers } from "next/headers";
import { createHomeFinderEntry } from "@/products/home-finder/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { customersReleaseEnabled } from "@/platform/customers/release";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { HomeFinderBuyer } from "@/experience/enterprise/HomeFinderBuyer";
export const dynamic = "force-dynamic";
export default async function BuyerPage({ params }: { params: Promise<{ bindingId: string }> }) {
  if (!customersReleaseEnabled() || !workspaceReleaseEnabled()) notFound();
  const bindingId = z.string().uuid().safeParse((await params).bindingId); if (!bindingId.success) notFound();
  const entry = await createHomeFinderEntry(bindingId.data, await headers()).catch(() => null);
  if (!entry) return <XaOutside from={null} meta="Home search" label="Home Finder is unavailable here"><div role="alert"><XaEmpty pose="alone" title="Open Home Finder on the brokerage website" job="New inquiries stay closed here until the brokerage link is used.">Home search only opens from the brokerage&apos;s own website, while its listings feed is current.</XaEmpty></div></XaOutside>;
  return <HomeFinderBuyer bindingId={bindingId.data} entryToken={entry.token} brokerageName={entry.brokerageName} />;
}
