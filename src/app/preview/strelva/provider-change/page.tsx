import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AgencyPeoplePreview } from "@/experience/workspace/preview/AgencyPeoplePreview";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { role = "agency", state = "awaiting_policy", mode = "light" } = await searchParams;
  return <AgencyPeoplePreview surface="handoff" state={state} role={role} mode={mode} />;
}
