import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ListingsSyncFixtures } from "./Fixtures";

export const dynamic = "force-dynamic";
export const metadata = { title: "Listings in sync · Local preview", robots: { index: false, follow: false } };

export default function Page() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-8"><div className="mx-auto max-w-3xl">
    <p className="mb-4 text-xs text-gray-muted">Fictional local interface proof · no account or provider access</p>
    <h1 className="mb-8 text-2xl font-medium">Harbor Dental</h1>
    <ListingsSyncFixtures />
  </div></main>;
}
