import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XaSpecimen } from "./XaSpecimen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA kit", robots: { index: false, follow: false } };

export default async function XaKitPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { mode } = await searchParams;
  return <XaSpecimen mode={mode === "dark" ? "dark" : "light"} />;
}
