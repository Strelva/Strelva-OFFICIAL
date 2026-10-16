import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { TodayPhonePreview } from "@/experience/workspace/preview/TodayPhonePreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional Today on the phone", robots: { index: false, follow: false } };

const STATES = ["waiting", "done", "empty", "loading", "error", "member"] as const;

/** XA · E6, Today on the phone, inside the real StrelvaShell. ?state=waiting|done|empty|loading|error|member&mode=dark */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const q = await searchParams;
  const state = STATES.find(item => item === q.state) ?? "waiting";
  return <TodayPhonePreview key={state} state={state} mode={q.mode === "dark" ? "dark" : "light"} />;
}
