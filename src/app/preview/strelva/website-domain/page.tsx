import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsiteDomainPreview } from "@/experience/workspace/preview/WebsiteConnectionPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website domain fixture", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  return <WebsiteDomainPreview state={params.state ?? "ready"} mode={params.mode === "dark" ? "dark" : "light"} />;
}
