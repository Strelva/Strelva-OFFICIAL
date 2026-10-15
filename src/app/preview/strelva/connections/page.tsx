import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ConnectionsPreview } from "@/experience/connections/ConnectionsPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Connections preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; kind?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready", kind, mode } = await searchParams;
  return <ConnectionsPreview state={state} kind={kind === "agency" ? "agency" : "customer"} mode={mode === "dark" ? "dark" : "light"} />;
}
