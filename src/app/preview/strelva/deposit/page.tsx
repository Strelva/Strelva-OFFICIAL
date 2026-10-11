import { notFound } from "next/navigation";
import { DepositPreview } from "@/experience/workspace/preview/DepositPreview";
import { depositPreviewStates, type DepositPreviewState } from "@/experience/workspace/preview/deposit-fixture";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const metadata = { title: "Deposit preview", robots: { index: false, follow: false } };

export default async function DepositPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready" } = await searchParams;
  if (!depositPreviewStates.includes(state as DepositPreviewState)) notFound();
  return <DepositPreview state={state as DepositPreviewState} />;
}
