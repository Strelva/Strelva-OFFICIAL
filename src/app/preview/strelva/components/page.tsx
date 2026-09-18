import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ComponentReference } from "./ComponentReference";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Component reference", robots: { index: false, follow: false } };

export default async function ComponentReferencePage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { theme } = await searchParams;
  return <ComponentReference initialTheme={theme === "light" ? "light" : "dark"} />;
}
