"use client";
import { useCallback, useEffect, useState } from "react";
import { connectionsResponseSchema } from "@/experience/connections/model";
import type { ConnectionRead } from "./RequiredConnections";

/**
 * One Connections read for a workspace, shared by anything that lists what an
 * App needs. Follow-up: PackageCatalog still carries its own copy of this
 * effect; move it onto this hook when that file is next open.
 */
export function useConnectionRead(workspaceId: string, request: typeof fetch, enabled: boolean): { read: ConnectionRead; retry: () => void } {
  const [read, setRead] = useState<ConnectionRead>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void request(`/api/workspace/connections?${new URLSearchParams({ workspaceId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      if (!response.ok) { if (!controller.signal.aborted) setRead({ status: "error", permission: response.status === 403 }); return; }
      const parsed = connectionsResponseSchema.parse(await response.json());
      if (parsed.connections.some(row => row.workspaceId !== workspaceId)) throw new Error("Connections returned for another workspace.");
      if (!controller.signal.aborted) setRead({ status: "ready", ...parsed });
    }).catch(() => { if (!controller.signal.aborted) setRead({ status: "error", permission: false }); });
    return () => controller.abort();
  }, [request, workspaceId, enabled, attempt]);
  return { read: enabled ? read : { status: "loading" }, retry };
}
