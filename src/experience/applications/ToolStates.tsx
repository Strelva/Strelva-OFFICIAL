"use client";
/**
 * The states an internal tool opened from a link can be in before it shows:
 * opening, unavailable to this account, or not read. Pebble is in frame for the
 * bad news and says what it is doing; one way forward is the ink pill.
 */
import type { ReactNode } from "react";
import { XaButton, XaButtonLink, XaEmpty, XaWorking } from "@/components/ui/strelva/Xa";
import { XaObjectPage } from "@/components/ui/strelva/Xa";
import { StandaloneApplicationShell } from "./StandaloneApplicationShell";

export function ToolOpening({ title = "Opening the internal tool", step = "Checking your access" }: { title?: string; step?: string }) {
  return <StandaloneApplicationShell><XaObjectPage story={<XaWorking title={title} steps={[{ id: "access", label: step, state: "active" }]} />} /></StandaloneApplicationShell>;
}

export function ToolClosed({ kind, title, message, signInHref, onRetry, retryLabel = "Try again", extra }: {
  kind: "denied" | "error";
  title: string;
  message: ReactNode;
  signInHref?: string;
  onRetry?: () => void;
  retryLabel?: string;
  extra?: ReactNode;
}) {
  return <StandaloneApplicationShell><XaObjectPage story={<div role="alert">
    <XaEmpty pose={kind === "error" ? "fixing" : "alone"} title={title}
      job={kind === "error" ? "Nothing you typed was sent twice. Your place is kept." : "Records stay closed until your access is back."}
      action={signInHref ? <XaButtonLink variant="primary" size="lg" href={signInHref}>Sign in</XaButtonLink> : onRetry ? <XaButton variant="primary" size="lg" onClick={onRetry}>{retryLabel}</XaButton> : undefined}>
      {message}
    </XaEmpty>
    {extra}
  </div>} /></StandaloneApplicationShell>;
}
