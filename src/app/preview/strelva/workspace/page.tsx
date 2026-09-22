import { notFound, redirect } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";

export default async function WorkspacePreviewAlias({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const source = await searchParams;
  const params = new URLSearchParams();
  for (const name of ["view", "work", "scenario", "workspaceId", "search", "template", "offering", "standingId", "assignmentId", "row", "previewSetup"]) {
    const value = source[name];
    if (typeof value === "string") params.set(name, value);
  }
  if (!params.has("scenario")) {
    const workspaceId = params.get("workspaceId");
    params.set("scenario", workspaceId === "22222222-2222-4222-8222-222222222222" ? "agency"
      : workspaceId === "33333333-3333-4333-8333-333333333333" ? "read-only" : "managed");
  }
  redirect(`/preview/strelva?${params.toString()}`);
}
