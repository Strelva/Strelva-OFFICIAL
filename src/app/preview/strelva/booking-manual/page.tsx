import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ManualBookingPreview } from "@/experience/bookings/ManualBookingPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Booking request preview", robots: { index: false, follow: false } };
export default async function ManualPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  return <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black"><div className="mx-auto max-w-xl"><h1 className="font-display text-3xl">Take a booking request</h1><p className="mt-4 text-sm text-gray-muted">Fictional business and customer. Every action uses an isolated response; no booking or email is sent.</p><ManualBookingPreview state={state} /></div></main>;
}
