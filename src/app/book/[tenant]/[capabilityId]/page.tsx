import { notFound } from "next/navigation";
import { AskServiceBookingForm } from "@/products/scheduling/client";
export const dynamic = "force-dynamic";
/** Public visitor entry. Availability, ownership and reservations use existing v1 APIs. */
export default async function PublicServiceBooking({ params }: { params: Promise<{ tenant: string; capabilityId: string }> }) {
  const { tenant, capabilityId } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenant) || !/^[a-z][a-z0-9_-]{0,79}$/.test(capabilityId)) notFound();
  const range=await currentRange();
  return <main className="mx-auto w-full max-w-2xl px-4 py-10"><AskServiceBookingForm tenant={tenant} capabilityId={capabilityId} range={range} /></main>;
}
async function currentRange(){const now=Date.now();return {from:new Date(now).toISOString(),to:new Date(now+60*86400000).toISOString()};}
