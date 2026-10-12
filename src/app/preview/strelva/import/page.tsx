import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { SystemsCanonShell } from "@/experience/workspace/preview/SystemsCanonShell";
import { TrackerImportFixture } from "@/experience/workspace/preview/TrackerImportFixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Spreadsheet import preview", robots: { index: false, follow: false } };
export default async function TrackerImportPreview({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <SystemsCanonShell systemName="Matter tracker" mode={mode === "dark" ? "dark" : "light"}><TrackerImportFixture key={state ?? "ready"} state={state ?? "ready"} /></SystemsCanonShell>;
}
