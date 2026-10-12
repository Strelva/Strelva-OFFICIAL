"use client";
import { useEffect, useState } from "react";
import { packageCreatorSchema } from "@/platform/system-versions/listing-contracts";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
type CreatorProps = { workspaceId: string; systemId: string; requestOverride?: typeof fetch };
export function SystemCreator(props: CreatorProps) { return <ScopedSystemCreator key={`${props.workspaceId}:${props.systemId}`} {...props} />; }
function ScopedSystemCreator({ workspaceId, systemId, requestOverride }: CreatorProps) {
  const workspaceRequest = useWorkspaceRequest(), request = requestOverride ?? workspaceRequest;
  const [name, setName] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { const controller = new AbortController();
    void request(`/api/workspace/packages?${new URLSearchParams({ workspaceId, systemId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Creator lineage unavailable");
      const creator = packageCreatorSchema.parse(await response.json());
      if (!controller.signal.aborted) { setName(creator.creatorName); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [request, workspaceId, systemId]);
  return <p className="mt-2 text-sm text-gray-muted">{name ? <a className="underline underline-offset-2" href={`/workspace/source-attribution?${new URLSearchParams({ workspaceId, systemId })}`}>Made by {name}</a> : failed ? "Creator lineage could not be verified." : "Reading creator lineage…"}</p>;
}
