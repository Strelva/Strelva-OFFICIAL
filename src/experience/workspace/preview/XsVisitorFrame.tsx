import type { ReactNode } from "react";

/** Preview-only wrapper: dark mode for visitor pages follows data-workspace-mode, as a device setting would. */
export function XsVisitorFrame({ mode, children }: { mode?: string; children: ReactNode }) {
  return <div data-workspace-mode={mode === "dark" ? "dark" : undefined} style={{ minHeight: "100dvh" }}>{children}</div>;
}
