"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { readRequestDraft } from "./request-draft";

const IntentContext = createContext({ request: "" });
export function useWorkspaceIntent() { return useContext(IntentContext); }

type Props = { request: string; draftKey: string; children: ReactNode };
/** Presentation continuity only. Context never grants resource or provider authority. */
export function WorkspaceIntent(props: Props) { return <IntentSession key={props.draftKey} {...props} />; }
function IntentSession({ request, draftKey, children }: Props) {
  const [retained, setRetained] = useState("");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setRetained(readRequestDraft(window.sessionStorage, draftKey)); }
      catch { setRetained(""); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftKey]);
  return <IntentContext.Provider value={{ request: request || retained }}>{children}</IntentContext.Provider>;
}
