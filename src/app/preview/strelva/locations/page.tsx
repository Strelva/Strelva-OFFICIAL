import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { EnterprisePreview } from "@/experience/workspace/preview/EnterprisePreview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Locations preview · Strelva", robots: { index: false, follow: false } };
export default async function LocationsPreview({ searchParams }: { searchParams: Promise<{ view?: string; state?: string; location?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { view, state = "ready", location } = await searchParams;
  return <EnterprisePreview view={view === "push" || view === "access-review" ? view : "locations"} state={state} locationId={location} />;
}
