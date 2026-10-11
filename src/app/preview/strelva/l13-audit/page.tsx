import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { L13AuditPreview } from "@/experience/workspace/preview/L13AuditPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Website check preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "entry" } = await searchParams;
  return <L13AuditPreview state={state} />;
}
