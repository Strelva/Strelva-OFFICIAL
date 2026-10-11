import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PossibilityCanonPreview } from "@/experience/workspace/preview/PossibilityCanonPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Possibility comparison preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <PossibilityCanonPreview state={state} mode={mode === "dark" ? "dark" : "light"} />;
}
