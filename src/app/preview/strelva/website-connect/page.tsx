import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsiteConnectPreview } from "@/experience/workspace/preview/WebsiteConnectionPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website connection fixture", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; visibility?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  return <WebsiteConnectPreview state={params.state ?? "install"} mode={params.mode === "dark" ? "dark" : "light"} visibility={params.visibility === "1"} />;
}
