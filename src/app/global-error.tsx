"use client";

import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";
import { GLOBAL_ERROR_BACKGROUND, GlobalErrorBody } from "@/experience/states/GlobalErrorDocument";

/** Root-layout failures replace the layout, so this boundary owns html/body. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { captureException(error); }, [error]);
  return <html><body style={{ margin: 0, background: GLOBAL_ERROR_BACKGROUND }}><GlobalErrorBody /></body></html>;
}
