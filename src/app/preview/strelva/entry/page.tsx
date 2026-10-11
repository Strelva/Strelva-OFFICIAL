import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { EntryPreview } from "@/experience/workspace/preview/EntryPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Entry · Local interface preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { view = "sign-up", state = "ready" } = await searchParams;
  return <EntryPreview view={view} state={state} />;
}
