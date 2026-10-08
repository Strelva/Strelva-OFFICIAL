import { headers } from "next/headers";
import { createHomeFinderEntry } from "@/products/home-finder/entry";
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
  if (!entry) return <main className="mx-auto max-w-xl space-y-4 p-6"><h1 className="font-display text-2xl">Open Home Finder on the brokerage website</h1><p>The approved brokerage origin, current installation grant and provider qualification are required. New inquiries are unavailable here.</p></main>;
  return <HomeFinderBuyer bindingId={bindingId.data} entryToken={entry.token} brokerageName={entry.brokerageName} />;
}
