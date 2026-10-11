import { notFound } from "next/navigation";
import { L13Applications } from "@/experience/workspace/preview/L13Applications";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications · Local interface preview", robots: { index: false, follow: false } };

export default async function ApplicationsPreviewPage({ searchParams }: { searchParams: Promise<{ kind?: string; state?: string; mode?: string; role?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { kind, state, mode, role } = await searchParams;
  return <L13Applications key={`${kind}:${state}:${mode}:${role}`} kind={kind === "custom" || kind === "agency" ? kind : "native"} state={state || "ready"} mode={mode === "dark" ? "dark" : "light"} ownerPreview={role === "owner"} />;
}
