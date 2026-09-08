import { notFound, redirect } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export const dynamic = "force-dynamic";

export default async function WorkspacePreviewAlias({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const source = await searchParams;
  const params = new URLSearchParams();
  for (const name of ["view", "work", "scenario"]) {
    const value = source[name];
    if (typeof value === "string") params.set(name, value);
  }
  if (!params.has("scenario")) params.set("scenario", "managed");
  redirect(`/preview/strelva?${params.toString()}`);
}
