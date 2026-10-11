import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PortabilityFixture } from "./PortabilityFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business portability · Local interface preview", robots: { index: false, follow: false } };

export default async function PortabilityPreviewPage({ searchParams }: { searchParams: Promise<{ surface?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { surface, state } = await searchParams;
  return <PortabilityFixture surface={surface === "exit" ? "exit" : "export"} state={state ?? "ready"} />;
}
