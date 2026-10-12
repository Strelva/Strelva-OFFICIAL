import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ClaimReviewPreview } from "@/experience/workspace/preview/ClaimReviewPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Claim review preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  return <ClaimReviewPreview state={state} />;
}
