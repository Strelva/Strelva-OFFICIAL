"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Input context only. It grants no access and is never an execution receipt. */
export interface WorkspaceClientIntent {
  workspaceId: string;
  request: string;
  route: string;
  templateId?: string;
}
const IntentContext = createContext<WorkspaceClientIntent | null>(null);
export function WorkspaceIntentProvider({ value, children }: { value: WorkspaceClientIntent | null; children: ReactNode }) {
  return <IntentContext.Provider value={value}>{children}</IntentContext.Provider>;
}
export function useWorkspaceIntent(workspaceId: string, route: string): WorkspaceClientIntent | null {
  const value = useContext(IntentContext);
  return value?.workspaceId === workspaceId && value.route === route ? value : null;
}
