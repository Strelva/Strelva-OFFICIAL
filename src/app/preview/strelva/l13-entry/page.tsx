import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { L13EntryPreview } from "@/experience/workspace/preview/L13EntryPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Entry preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { view = "claim", state = "ready" } = await searchParams;
  return <L13EntryPreview view={view} state={state} />;
}
