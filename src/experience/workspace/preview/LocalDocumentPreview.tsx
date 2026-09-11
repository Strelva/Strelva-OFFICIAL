"use client";
import { useMemo, useRef } from "react";
import { changeDocument, createDocument } from "@/products/documents/engine";
import { DocumentExperience, type DocumentSaved, type DocumentTransport } from "../DocumentExperience";

export function LocalDocumentPreview({ workspaceId, readOnly, initialRequestText }: { workspaceId: string; readOnly: boolean; initialRequestText?: string }) {
  const savedRef = useRef<DocumentSaved | null>(null);
  const transport = useMemo<DocumentTransport>(() => {
    return { mode: "local-preview", async read(workId) {
      const saved = savedRef.current;
      if (!saved || saved.workId !== workId) throw new Error("This preview document is no longer available.");
      return structuredClone(saved);
    }, async write(body) {
      if (readOnly) throw new Error("This workspace is read only.");
      const saved = savedRef.current;
      if (body.action === "create") savedRef.current = { workId: crypto.randomUUID(), workspaceId, document: createDocument(body.input, "preview-user") };
      else if (body.action === "command" && saved && body.workId === saved.workId) savedRef.current = { ...saved, document: changeDocument(saved.document, body.command, "preview-user") };
      else throw new Error("That action is not available in this preview.");
      return structuredClone(savedRef.current!);
    } };
  }, [readOnly, savedRef, workspaceId]);
  return <><p className="mx-auto max-w-3xl px-4 pt-4 text-sm text-gray-muted" role="note">Local rehearsal. This document stays in this browser view and resets when you leave or reload.</p><DocumentExperience workspaceId={workspaceId} readOnly={readOnly} transport={transport} initialRequestText={initialRequestText} /></>;
}
