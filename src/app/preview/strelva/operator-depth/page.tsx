import { notFound } from "next/navigation";
import { OperatorFrame } from "@/experience/operations/OperatorFrame";
import { StNotice, StPage } from "@/components/ui/strelva/Kit";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OperatorDepthPreview } from "@/experience/workspace/preview/OperatorDepthPreview";
import { OPERATOR_CLIENTS } from "@/experience/workspace/preview/operator-fixture";
import { OPERATOR_DEPTH_SURFACES, type OperatorDepthScenario, type OperatorDepthSurface } from "@/experience/workspace/preview/operator-depth-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operator depth · Fictional preview", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ surface?: string; scenario?: string; mode?: string; result?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const query = await searchParams;
  const surface: OperatorDepthSurface = OPERATOR_DEPTH_SURFACES.includes(query.surface as OperatorDepthSurface) ? query.surface as OperatorDepthSurface : "actions";
  const scenario: OperatorDepthScenario = ["ready", "empty", "loading", "error", "denied"].includes(query.scenario ?? "") ? query.scenario as OperatorDepthScenario : "ready";
  return <div data-workspace-mode={query.mode === "dark" ? "dark" : "light"}><OperatorFrame preview clients={OPERATOR_CLIENTS}>
    <StPage width={surface === "audit" ? "wide" : undefined}><StNotice>Fictional preview. People, records, counts and receipts are examples. Controls rehearse locally; no saved records, payments, providers or email change.</StNotice>
    <OperatorDepthPreview key={`${surface}-${scenario}-${query.result}`} surface={surface} scenario={scenario} result={query.result === "created"} /></StPage>
  </OperatorFrame></div>;
}
