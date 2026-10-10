import { notFound } from "next/navigation";
import { BookingCanonPreview } from "@/experience/workspace/preview/BookingCanonPreview";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
export const dynamic = "force-dynamic";
export const metadata = { title: "Booking rules preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <BookingCanonPreview screen="rules" state={state} mode={mode === "dark" ? "dark" : "light"} />;
}
