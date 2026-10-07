import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { listAgencyProspects, AgencyProspectingError } from "@/platform/agency-prospecting/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agency prospects", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const user = await getSessionUser();
  const { workspace } = await searchParams;
  let error: string | null = null;
  let prospects: Awaited<ReturnType<typeof listAgencyProspects>> = [];
  if (!user?.email || !user.email_confirmed_at) error = "Sign in with a verified account to see agency prospects.";
  else if (!workspace || !/^[a-f0-9-]{36}$/i.test(workspace)) error = "Open this page with your agency workspace.";
  else {
    try { prospects = await listAgencyProspects(workspace, user.id, user.email); }
    catch (cause) { error = cause instanceof AgencyProspectingError ? cause.message : "Prospects are temporarily unavailable."; }
  }
  return <main className="product-surface min-h-screen px-6 py-8 md:px-12">
    <div className="mx-auto max-w-5xl">
      <Link href="/workspace" className="text-sm text-m-text-2 underline">Back to workspace</Link>
      <h1 className="mt-6 font-display text-3xl text-m-text">Prospects</h1>
      <p className="mt-3 text-sm text-m-text-2">The latest 200 requests from your agency’s check links.</p>
      {error ? <p role="alert" className="mt-6 text-m-danger">{error}</p> : prospects.length === 0 ? <p className="mt-8 text-m-text-2">No prospects yet. Share your agency check link to start receiving requests.</p> :
        <div className="mt-8 overflow-x-auto"><table className="w-full text-left text-sm text-m-text">
          <caption className="sr-only">Agency prospect requests</caption>
          <thead><tr className="border-b border-m-rule">{["Business", "Contact", "Check", "Received"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>{prospects.map(prospect => <tr key={prospect.id} className="border-b border-m-rule-soft">
            <td className="px-4 py-4">{prospect.business}<p className="text-m-text-3">{prospect.url}</p></td>
            <td className="px-4 py-4">{prospect.name}<p>{prospect.email}</p></td>
            <td className="px-4 py-4">{prospect.source} · {prospect.grade} ({prospect.score}/100)</td>
            <td className="whitespace-nowrap px-4 py-4">{new Date(prospect.created_at).toLocaleDateString("en-US")}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  </main>;
}
