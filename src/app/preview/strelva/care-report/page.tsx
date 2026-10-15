import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { PreviewCareReportEditor } from "@/experience/care-reports/PreviewCareReports";
import {
  PREVIEW_BRAND, PREVIEW_EMPTY_FACTS, PREVIEW_FACTS, PREVIEW_NOTE, PREVIEW_RELEASES, PREVIEW_SNAPSHOT,
} from "@/experience/care-reports/preview-fixture";
import { PublishingPreviewFrame } from "@/experience/workspace/preview/PublishingPreviewFrame";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Care plan report preview", robots: { index: false, follow: false } };

const STATES = ["shared", "owner", "draft", "editor", "editor-staff", "email-off", "empty-month", "identity-unavailable"] as const;
type PreviewState = (typeof STATES)[number];

/** Fictional report for a fictional business. Every state of the document and the editor. */
export default async function CareReportPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state: name, mode } = await searchParams;
  const state: PreviewState = (STATES as readonly string[]).includes(name ?? "") ? (name as PreviewState) : "owner";
  const releases = PREVIEW_RELEASES;
  const document = (props: { snapshot: typeof PREVIEW_SNAPSHOT; releaseNumber: number | null; audience: "agency" | "owner" | "shared"; brand?: typeof PREVIEW_BRAND }) =>
    <CareReportDocument brand={props.brand ?? PREVIEW_BRAND} snapshot={props.snapshot} releaseNumber={props.releaseNumber} audience={props.audience}
      releases={props.releaseNumber ? releases : undefined} releaseHref={n => `/preview/strelva/care-report?state=${state}&release=${n}`}
      back={props.audience === "owner" ? { label: "Recaps", href: "/preview/strelva/recaps" } : undefined} />;
  if (state === "editor" || state === "editor-staff" || state === "email-off" || state === "identity-unavailable") {
    return <PublishingPreviewFrame place="Clients" mode={mode}><PreviewCareReportEditor state={state} /></PublishingPreviewFrame>;
  }
  const content = state === "shared" ? document({ snapshot: PREVIEW_SNAPSHOT, releaseNumber: 2, audience: "shared" })
    : state === "draft" ? document({ snapshot: { ...PREVIEW_FACTS, agencyNote: PREVIEW_NOTE, release: 1, publishedAt: PREVIEW_SNAPSHOT.publishedAt }, releaseNumber: null, audience: "agency" })
      : state === "empty-month" ? document({ snapshot: { ...PREVIEW_EMPTY_FACTS, agencyNote: null, release: 1, publishedAt: PREVIEW_SNAPSHOT.publishedAt }, releaseNumber: 1, audience: "owner" })
        : document({ snapshot: PREVIEW_SNAPSHOT, releaseNumber: 2, audience: "owner", brand: PREVIEW_BRAND });
  return <PublishingPreviewFrame place="Recaps" mode={mode} publicPage={state === "shared"}>{content}</PublishingPreviewFrame>;
}
