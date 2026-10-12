import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AgencyPeoplePreview } from "@/experience/workspace/preview/AgencyPeoplePreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Verification preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "unverified", mode = "light" } = await searchParams;
  return <AgencyPeoplePreview surface="verification" state={state} mode={mode} />;
}
