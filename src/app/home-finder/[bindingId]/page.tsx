import styles from "@/experience/enterprise/home-finder-buyer.module.css";
import { StCopy, StHead, StNotice, StPage } from "@/components/ui/strelva/Kit";
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
  if (!entry) return <main data-dashboard data-workspace-theme="linen" className={styles.paper}><StPage><StHead title="Open Home Finder on the brokerage website" /><StNotice tone="need">New inquiries are unavailable here.</StNotice><StCopy>The approved brokerage origin, current installation grant and provider qualification are required.</StCopy></StPage></main>;
  return <HomeFinderBuyer bindingId={bindingId.data} entryToken={entry.token} brokerageName={entry.brokerageName} />;
}
