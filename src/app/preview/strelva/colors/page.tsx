import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ColorReference } from "./ColorReference";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · Color reference", robots: { index: false, follow: false } };

export default function ColorReferencePage() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <ColorReference />;
}
