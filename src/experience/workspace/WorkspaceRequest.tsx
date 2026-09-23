"use client";

import { createContext, useContext, useCallback } from "react";
import type { WorkspaceAction } from "./contracts";

/** The production request path remains fetch; the isolated development preview supplies synthetic responses. */
export const WorkspaceRequestContext = createContext<typeof fetch>(fetch);
export function useWorkspaceRequest() {
  return useContext(WorkspaceRequestContext);
}

interface ErrorBody {
  error?: string;
}

export class WorkspaceRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!response.ok) throw new WorkspaceRequestError(body?.error || fallback, response.status);
  if (!body) throw new Error(fallback);
  return body;
}

async function postAction<T>(action: WorkspaceAction, fallback: string, request: typeof fetch): Promise<T> {
  const response = await request("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  return readResponse<T>(response, fallback);
}


export function usePostAction() {
  const request = useWorkspaceRequest();
  return useCallback(<T,>(action: WorkspaceAction, fallback: string) => postAction<T>(action, fallback, request), [request]);
}
