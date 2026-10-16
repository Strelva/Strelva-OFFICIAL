"use client";

import { createContext, useContext, type ReactNode } from "react";
import { XaOutside } from "@/experience/xa-object/XaObjectPage";

export const StandaloneApplicationModeContext = createContext<"light" | "dark">("light");

/**
 * Recipient and delegated pages open from a link: their own paper, without
 * workspace navigation (XA outside frame). `from` names the business or agency
 * when the page knows it; otherwise the frame shows Strelva, which signed the
 * person in.
 */
export function StandaloneApplicationShell({ children, from, meta }: { children: ReactNode; from?: string; meta?: ReactNode }) {
  const mode = useContext(StandaloneApplicationModeContext);
  return <XaOutside from={from ?? null} meta={meta} mode={mode} width="wide">{children}</XaOutside>;
}
