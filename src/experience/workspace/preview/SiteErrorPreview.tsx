"use client";
import PublicError from "@/app/(public)/error";

/** Preview only: the real error boundary with a reset that does nothing. */
export function SiteErrorPreview() {
  return <PublicError error={new Error("preview")} reset={() => undefined} />;
}
