import { StPage, StHead } from "@/components/ui/strelva/Kit";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AccessReviewPreview } from "@/experience/workspace/preview/AccessReviewPreview";
import { StHead, StNotice, StPage, StTextButton } from "@/components/ui/strelva/Kit";
export const dynamic = "force-dynamic";
export const metadata = { title: "Access review preview", robots: { index: false, follow: false } };
export default async function ReviewPreview({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready", mode } = await searchParams;
  return <main data-workspace-theme="linen" data-workspace-mode={mode === "dark" ? "dark" : "light"} className="min-h-dvh bg-canvas text-warm-black" style={{ fontFamily: "var(--font-workspace, system-ui)" }}><StPage width="wide"><StHead title="People and access review" meta="Fictional people and access. Actions stay in this preview." /><StNotice>Quarterly schedules, organization-wide sign-in history and audit exports are illustrated separately. <StTextButton href="/preview/strelva/locations?view=access-review">Open the clinic review preview</StTextButton></StNotice><AccessReviewPreview state={state} /></StPage></main>;
}
