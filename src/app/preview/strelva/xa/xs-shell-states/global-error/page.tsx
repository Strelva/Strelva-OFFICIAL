import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { GLOBAL_ERROR_BACKGROUND, GlobalErrorBody } from "@/experience/states/GlobalErrorDocument";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · root crash fallback", robots: { index: false, follow: false } };

/** The root crash fallback as /global-error draws it, without throwing to get there. The real one owns html/body. */
export default function GlobalErrorPreview() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <div style={{ position: "fixed", inset: 0, overflow: "auto", background: GLOBAL_ERROR_BACKGROUND }}><GlobalErrorBody /></div>;
}
