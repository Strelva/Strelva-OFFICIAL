import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CustomApplicationCreateExperience } from "@/experience/custom-applications/CustomApplicationCreateExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create custom application", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function CustomApplicationCreatePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  const value = (await searchParams).workspaceId;
  const workspaceId = typeof value === "string" && z.string().uuid().safeParse(value).success ? value : null;
  if (!workspaceId) redirect("/workspace");
  return <CustomApplicationCreateExperience workspaceId={workspaceId} />;
}
