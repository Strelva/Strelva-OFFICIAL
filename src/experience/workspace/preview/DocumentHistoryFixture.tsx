"use client";

import { useMemo, useRef } from "react";
import { DocumentExperience, type DocumentTransport } from "../DocumentExperience";
import { changeDocument, createDocument, type DocumentHistoryPage, type DocumentReceipt, type WorkspaceDocument } from "@/products/documents/contracts";

const workId = "d0c00000-0000-4000-8000-000000000001";
const workspaceId = "d0c00000-0000-4000-8000-000000000002";

/** Fictional shared file; every read/write remains in this fixture. */
export function DocumentHistoryFixture({ state }: { state: string }) {
  const saved = useRef<WorkspaceDocument | null>(null);
  const transport = useMemo<DocumentTransport>(() => {
    let document = createDocument({ title: "New client handoff", text: "Confirm the next appointment and responsible person." }, "preview-owner");
    const receipts: DocumentReceipt[] = [];
    if (state !== "empty") for (let revision = 1; revision <= 45; revision += 1) {
      document = changeDocument(document, { kind: "edit", expectedRevision: revision - 1, title: document.title,
        text: `Handoff procedure, revision ${revision}.\nConfirm the next appointment and responsible person.\nKeep the client informed when requirements change.` }, revision % 2 ? "preview-owner" : "preview-agency");
      receipts.push(document.history.at(-1)!);
    }
    return {
      mode: "local-preview",
      async read() {
        if (state === "loading") return new Promise(() => {});
        if (state === "denied") throw new Error("This document is unavailable to your account.");
        return { workId, workspaceId, document: saved.current ?? document, historyEnabled: state !== "off" };
      },
      async write(body) {
        if (state === "read-only") throw new Error("This document is read only.");
        const revised = changeDocument(saved.current ?? document, body.command, "preview-owner");
        saved.current = revised;
        receipts.push(revised.history.at(-1)!);
        return { workId, workspaceId, document: revised, historyEnabled: state !== "off" };
      },
      async history(_workId, before): Promise<DocumentHistoryPage> {
        if (state === "history-error") throw new Error("Document history is unavailable. Try again.");
        if (state === "history-loading") return new Promise(() => {});
        const page = receipts.filter(receipt => receipt.revision < before).reverse().slice(0, 20);
        return { workId, workspaceId, receipts: page, nextBeforeRevision: page.at(-1)!.revision > 1 ? page.at(-1)!.revision : null };
      },
    };
  }, [state]);
  return <DocumentExperience workspaceId={workspaceId} workId={workId} readOnly={state === "read-only" || state === "denied"} transport={transport} />;
}
