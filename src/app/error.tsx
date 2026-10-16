"use client";

import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";
import { XaPageBroke } from "@/experience/states/XaStates";

/** Root route boundary. The error is reported; the person sees no message, id or digest. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { captureException(error); }, [error]);
  return <XaPageBroke onRetry={reset} />;
}
