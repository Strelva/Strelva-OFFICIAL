import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OperatorFrame } from "@/experience/operations/OperatorFrame";
import { OperatorPreview } from "@/experience/workspace/preview/OperatorPreview";
import { OPERATOR_CLIENTS } from "@/experience/workspace/preview/operator-fixture";
export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Local fictional preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ scenario?: string; client?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const query = await searchParams;
  return <OperatorFrame preview clients={OPERATOR_CLIENTS}><OperatorPreview surface="client" scenario={query.scenario} client={query.client} /></OperatorFrame>;
}
