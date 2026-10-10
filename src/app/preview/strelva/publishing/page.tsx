import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PublishingContentPreview } from "@/experience/workspace/preview/PublishingContentPreview";
import { PublishingRecordPreview } from "@/experience/workspace/preview/PublishingRecordPreview";
import { PublishingGooglePreview } from "@/experience/workspace/preview/PublishingGooglePreview";
import { PublishingPreviewFrame } from "@/experience/workspace/preview/PublishingPreviewFrame";
import { UnsubscribePreview } from "@/experience/workspace/preview/UnsubscribePreview";

export const dynamic = "force-dynamic";
export default async function PublishingPreviewPage({ searchParams }: { searchParams: Promise<{ kind?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { kind, state = "ready", mode } = await searchParams;
  if (kind === "record") return <PublishingRecordPreview state={state} />;
  const place = kind === "google" ? "Google listing" : kind === "unsubscribe" ? "Newsletter preferences" : kind === "newsletter" ? "Newsletter" : "Website content";
  return <PublishingPreviewFrame place={place} mode={mode} publicPage={kind === "unsubscribe"}>
    {kind === "google" ? <PublishingGooglePreview state={state} /> : kind === "unsubscribe" ? <UnsubscribePreview state={state} /> : <PublishingContentPreview kind={kind === "newsletter" ? "newsletter" : "website"} state={state} />}
  </PublishingPreviewFrame>;
}
