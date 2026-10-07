import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ProposeBookingTimesPreview } from "@/experience/bookings/ProposeBookingTimesPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Owner booking reply preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6"><div className="mx-auto max-w-[760px]"><p className="text-sm text-gray-muted">Fictional inquiry · no provider sends</p><h1 className="mt-3 font-display text-3xl font-medium">Dana&apos;s consultation inquiry</h1><ProposeBookingTimesPreview state={state} /></div></main>;
}
