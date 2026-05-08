"use client";

import { useEffect } from "react";

export function AuthDocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} | Scaffold Web`;
  }, [title]);

  return null;
}
