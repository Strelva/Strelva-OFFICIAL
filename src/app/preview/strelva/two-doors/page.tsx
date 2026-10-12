import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { TwoDoorsPreview } from "@/experience/workspace/preview/TwoDoorsPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Bring in an agency preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ surface?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { surface = "owner", state = "ready", mode = "light" } = await searchParams;
  return <TwoDoorsPreview surface={surface === "agency" ? "agency" : "owner"} state={state} mode={mode} />;
}
