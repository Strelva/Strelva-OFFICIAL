import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OutcomesGallery } from "@/experience/workspace/preview/OutcomesGallery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Outcome components preview", robots: { index: false, follow: false } };

/** Gallery of the seven outcome components with fictional fixture data. */
export default function OutcomesPreviewPage() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <OutcomesGallery />;
}
