import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { PatientFormPreview } from "@/experience/workspace/preview/PatientFormPreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional patient form", robots: { index: false, follow: false } };

const STATES = ["filled", "blank", "urgent", "sent", "sent-urgent", "error", "panel"] as const;

/** XA · E5, the patient form: the real VisitorIntakeForm on the real Dental intake definition. ?state=filled|blank|urgent|sent|sent-urgent|error|panel */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const q = await searchParams;
  return <PatientFormPreview state={STATES.find(item => item === q.state) ?? "filled"} />;
}
