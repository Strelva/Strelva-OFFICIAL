import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AnswerCheckPreview } from "@/experience/workspace/preview/AnswerCheckPreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Gemini business check preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "entry" } = await searchParams;
  return <AnswerCheckPreview state={state} />;
}
