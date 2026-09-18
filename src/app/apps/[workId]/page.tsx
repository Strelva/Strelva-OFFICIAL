import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ApplicationUseExperience } from "@/experience/applications/ApplicationUseExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Application",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function FinishedApplicationPage({ params }: { params: Promise<{ workId: string }> }) {
  const workId = (await params).workId;
  if (!z.string().uuid().safeParse(workId).success) notFound();
  return <ApplicationUseExperience workId={workId} />;
}
