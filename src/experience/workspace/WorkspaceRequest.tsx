"use client";

import { createContext, useContext } from "react";

/** The production request path remains fetch; the isolated development preview supplies synthetic responses. */
export const WorkspaceRequestContext = createContext<typeof fetch>(fetch);
export function useWorkspaceRequest() {
  return useContext(WorkspaceRequestContext);
}
