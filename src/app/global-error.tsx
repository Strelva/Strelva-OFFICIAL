"use client";

import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";
import NextError from "next/error";

/** Root-layout failures replace the layout, so this boundary owns html/body. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { captureException(error); }, [error]);
  return <html><body><NextError statusCode={0} /></body></html>;
}
