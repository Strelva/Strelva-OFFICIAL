import { StPage, StHead } from "@/components/ui/strelva/Kit";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AccessReviewPreview } from "@/experience/workspace/preview/AccessReviewPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Access review preview", robots: { index: false, follow: false } };
export default async function ReviewPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  return <StPage><StHead title="People & access" meta="Fictional people and access. Actions stay in this preview." /><AccessReviewPreview state={state} /></StPage>;
}
