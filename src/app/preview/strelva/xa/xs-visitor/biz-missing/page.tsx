import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import BusinessPageNotFound from "@/app/biz/[handle]/not-found";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business page not found preview", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { mode } = await searchParams;
  return <XsVisitorFrame mode={mode}><BusinessPageNotFound /></XsVisitorFrame>;
}
