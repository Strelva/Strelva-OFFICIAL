import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { GettingStartedPreview } from "@/experience/getting-started/GettingStartedPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Getting started preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready", mode = "light" } = await searchParams;
  return <GettingStartedPreview state={state} mode={mode === "dark" ? "dark" : "light"} />;
}
