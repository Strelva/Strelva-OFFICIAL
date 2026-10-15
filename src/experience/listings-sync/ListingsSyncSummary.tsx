"use client";
import { useEffect, useState } from "react";
import { StPillLink } from "@/components/ui/strelva/Kit";
import { listingsHeadline, listingsSyncViewSchema, type ListingsSyncView } from "@/products/listings-sync";

/**
 * One line for the agency client row: whether this client's details match
 * across its places. The agency sees it and receives the Requests; the owner
 * decides, so there is no approve control here. Renders nothing while the App
 * is off (404).
 */
export function ListingsSyncSummary({ workspaceId, clientName, request = fetch }: { workspaceId: string; clientName?: string; request?: typeof fetch }) {
  const [view, setView] = useState<ListingsSyncView | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/listings-sync?${new URLSearchParams({ workspaceId })}`, { credentials: "same-origin" });
        if (!live || !response.ok) return;
        const parsed = listingsSyncViewSchema.safeParse(await response.json());
        if (live && parsed.success) setView(parsed.data);
      } catch { /* a line that cannot load is simply not shown */ }
    })();
    return () => { live = false; };
  }, [request, workspaceId]);
  if (!view) return null;
  const headline = listingsHeadline(view);
  return <p className="mx-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <span>Listings in sync · {view.waitingOnOwner ? `Waiting on ${clientName ?? "the owner"}` : headline.text}</span>
    <StPillLink href={`/workspace/business-details?workspaceId=${encodeURIComponent(workspaceId)}#listings`} variant="soft" size="md">Open</StPillLink>
  </p>;
}
