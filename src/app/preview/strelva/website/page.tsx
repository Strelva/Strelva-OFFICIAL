import { notFound, redirect } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export default function ManagedPreviewEntry() {
  if (!strelvaUiPreviewEnabled()) notFound();
  redirect("/preview/strelva/website/dashboard/site");
}
