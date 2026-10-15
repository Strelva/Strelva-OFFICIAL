import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewAgencyCareReports } from "@/experience/care-reports/PreviewCareReports";
import { PublishingPreviewFrame } from "@/experience/workspace/preview/PublishingPreviewFrame";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Agency Care plan reports preview", robots: { index: false, follow: false } };

const STATES = ["ready", "loading", "error", "off", "generated-with-skips"] as const;

/** Fictional agency, fictional clients. States of the Care plan reports section in Clients. */
export default async function AgencyCareReportsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state: name, mode } = await searchParams;
  const state = (STATES as readonly string[]).includes(name ?? "") ? (name as string) : "ready";
  return <PublishingPreviewFrame place="Clients" mode={mode}>
    <PreviewAgencyCareReports state={state} />
    {state === "off" ? <p role="note" style={{ fontSize: 12 }}>Care plan reports is off, so the section renders nothing.</p> : null}
  </PublishingPreviewFrame>;
}
