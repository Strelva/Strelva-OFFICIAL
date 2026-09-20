import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CustomApplicationUseExperience } from "@/experience/custom-applications/CustomApplicationUseExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custom application", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function CustomApplicationPage({ params }: { params: Promise<{ workId: string }> }) {
  const workId = (await params).workId;
  if (!z.string().uuid().safeParse(workId).success) notFound();
  return <CustomApplicationUseExperience workId={workId} />;
}
