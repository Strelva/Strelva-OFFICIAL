"use client";

import { useEffect } from "react";

export function AuthDocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} | Strelva`;
  }, [title]);

  return null;
}
