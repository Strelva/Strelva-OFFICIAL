import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { BookingCanonPreview } from "@/experience/workspace/preview/BookingCanonPreview";
import { BookingsPreview } from "@/experience/workspace/preview/BookingsPreview";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Bookings preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; view?: string; source?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, view, mode } = await searchParams;
  if (view === "sessions") return <BookingCanonPreview screen="sessions" state={state} mode={mode === "dark" ? "dark" : "light"} />;
  return <BookingsPreview searchParams={searchParams} />;
}
