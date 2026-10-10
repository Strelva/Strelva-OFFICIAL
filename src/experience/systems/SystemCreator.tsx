"use client";
import { useEffect, useState } from "react";
import { packageCreatorSchema } from "@/platform/system-versions/listing-contracts";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
export function SystemCreator({ workspaceId, systemId }: { workspaceId: string; systemId: string }) {
  const request = useWorkspaceRequest();
  const [name, setName] = useState<string | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => { const controller = new AbortController();
    void request(`/api/workspace/packages?${new URLSearchParams({ workspaceId, systemId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Creator lineage unavailable");
      const creator = packageCreatorSchema.parse(await response.json());
      if (!controller.signal.aborted) { setName(creator.creatorName); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [request, workspaceId, systemId]);
  return <p className="mt-2 text-sm text-gray-muted">{name ? `Made by ${name}` : failed ? "Creator lineage could not be verified." : "Reading creator lineage…"}</p>;
}
