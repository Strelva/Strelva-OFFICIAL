import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsitePanelsPreview, type WebsitePanelsView, type WebsitePanelsState } from "@/experience/workspace/preview/WebsitePanelsPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Website panels preview", robots: { index: false, follow: false } };

/** Fictional canon compositions only; never mounts in a customer route. */
export default async function WebsitePanelsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const view: WebsitePanelsView = params.view === "look" || params.view === "articles" || params.view === "results" ? params.view : "media";
  const state: WebsitePanelsState = params.state === "loading" || params.state === "empty" || params.state === "error" || params.state === "permission" ? params.state : "ready";
  return <WebsitePanelsPreview view={view} state={state} mode={params.mode === "dark" ? "dark" : "light"} />;
}
