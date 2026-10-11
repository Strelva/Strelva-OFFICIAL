import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { KitSpecimen } from "./KitSpecimen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · 1.0 kit", robots: { index: false, follow: false } };

export default async function KitPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { mode } = await searchParams;
  return <KitSpecimen mode={mode === "dark" ? "dark" : "light"} />;
}
