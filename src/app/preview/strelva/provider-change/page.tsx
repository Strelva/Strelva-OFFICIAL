import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import ProviderChangeNotices from "@/app/workspace/provider-change/ProviderChangeNotices";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { role = "owner", state = "awaiting_policy" } = await searchParams;
  const business = "d2940000-0000-4000-8000-000000000010";
  const clocked = state === "notified";
  return <main className="mx-auto max-w-xl px-6 py-12"><h1 className="font-display text-2xl">Provider changes · Local fixture</h1><ProviderChangeNotices workspaceId={role === "agency" ? "d2940000-0000-4000-8000-000000000020" : business} canCancel={role === "owner"} requests={[{ id: "d2940000-0000-4000-8000-000000000040", business_workspace_id: business, status: state, respond_by: clocked ? "2099-01-01T00:00:00Z" : null, policy_version: clocked || state === "awaiting_notice" ? "fictional-ui-policy" : null, responses: clocked ? [{ kind: "acknowledged", note: "Outgoing agency read the notice." }] : [] }]} /></main>;
}
