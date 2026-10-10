import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsiteCanonPreview, type WebsiteCanonState, type WebsiteCanonView } from "@/experience/workspace/preview/WebsiteCanonPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Website review preview", robots: { index: false, follow: false } };

/** Fictional in-memory website review only; never authorizes a live operation. */
export default async function WebsiteCanonPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const view: WebsiteCanonView = params.view === "published" || params.view === "history" || params.view === "pause" || params.view === "checks" ? params.view : "review";
  const state: WebsiteCanonState = params.state === "loading" || params.state === "empty" || params.state === "error" || params.state === "permission" ? params.state : "ready";
  const mode = params.mode === "dark" ? "dark" : "light";
  return <WebsiteCanonPreview key={`${view}:${state}:${mode}`} initialView={view} state={state} mode={mode} />;
}
