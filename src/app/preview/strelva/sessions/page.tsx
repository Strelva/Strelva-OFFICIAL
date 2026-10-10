import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { SessionsCanonPreview } from "@/experience/workspace/preview/SessionsCanonPreview";
import { SystemsCanonShell } from "@/experience/workspace/preview/SystemsCanonShell";
export const dynamic = "force-dynamic";
export const metadata = { title: "Mediation sessions preview", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <SystemsCanonShell mode={mode === "dark" ? "dark" : "light"}><SessionsCanonPreview state={state} /></SystemsCanonShell>;
}
