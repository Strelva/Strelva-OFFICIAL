import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedOperatorContext } from "@/platform/infra/auth";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readOperatorMoneyConfiguration } from "@/platform/connect/governed-operations";
import { connectProfile } from "@/platform/connect";
import { OperatorMoney } from "@/experience/workspace/money/OperatorMoney";
export const dynamic = "force-dynamic";
export default async function OperatorMoneyPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || process.env.STRELVA_REVENUE_SPLITS !== "1") notFound();
  const operator = await getAuthenticatedOperatorContext(); if (!operator) redirect("/sign-in");
  const { workspaceId } = await searchParams;
  if (!workspaceId) return <section className="max-w-3xl"><h1 className="font-display text-3xl">Recorded money operations</h1><p className="mt-4 text-gray-muted">Open an existing workspace and review its agreement and payout records. Written commercial terms must already be decided.</p><form className="mt-6 grid gap-4" method="get"><TextInput label="Workspace reference" name="workspaceId" required /><Button type="submit">Open money records</Button></form></section>;
  let graph;
  try { graph = await readOperatorMoneyConfiguration(operator.actor, workspaceId); }
  catch { return <section><h1 className="font-display text-3xl">Recorded money operations</h1><p className="mt-6" role="alert">Current operator access or workspace money records could not be confirmed. Sign in and reload.</p></section>; }
  let profileVersion: string | null = null; try { profileVersion = connectProfile().version; } catch { /* The missing approved profile remains visible. */ }
  const executionEnabled = process.env.STRELVA_CONNECT === "1" && process.env.STRELVA_SPLIT_PAYOUT_EXECUTION === "1";
  return <section className="max-w-3xl"><h1 className="font-display text-3xl">Recorded money operations</h1><p className="mt-4 break-words text-sm text-gray-muted">Workspace {workspaceId}. Recording terms does not authorize production billing or infer a payment mandate.</p><OperatorMoney key={workspaceId} graph={graph} actorId={operator.actor.userId} profileVersion={profileVersion} executionEnabled={executionEnabled} /></section>;
}
