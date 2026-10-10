"use client";

import { useMemo, useRef } from "react";
import { StMono, StPill, StRow, StRows, StSection } from "@/components/ui/strelva/Kit";
import { DocumentExperience, type DocumentTransport } from "../DocumentExperience";
import { changeDocument, createDocument, type DocumentHistoryPage, type DocumentReceipt, type WorkspaceDocument } from "@/products/documents/contracts";

const workId = "d0c00000-0000-4000-8000-000000000001";
const workspaceId = "d0c00000-0000-4000-8000-000000000002";

/** Fictional shared file; every read/write remains in this fixture. */
export function DocumentHistoryFixture({ state }: { state: string }) {
  const saved = useRef<WorkspaceDocument | null>(null);
  const transport = useMemo<DocumentTransport>(() => {
    let document = createDocument({ title: "Mediation agreement template.docx", text: "Private mediation agreement template." }, "preview-owner");
    const receipts: DocumentReceipt[] = [];
    if (state !== "empty") for (let revision = 1; revision <= (state.startsWith("history-") || state === "off" ? 45 : 4); revision += 1) {
      document = changeDocument(document, { kind: "edit", expectedRevision: revision - 1, title: document.title,
        text: `${["First version", "Replaced the fee table", "Fixed party numbering in section 2", "Added the confidentiality clause from the Erie County form"][(revision - 1) % 4]}.\nPrivate mediation agreement, revision ${revision}.` }, revision === 3 ? "preview-agency" : "preview-owner");
      const receipt = document.history.at(-1)!;
      receipt.at = ["2026-07-02T12:00:00Z", "2026-08-14T12:00:00Z", "2026-09-22T12:00:00Z", "2026-10-03T12:00:00Z"][(revision - 1) % 4]!;
      receipts.push(receipt);
    }
    return {
      mode: "local-preview",
      async read() {
        if (state === "loading") return new Promise(() => {});
        if (state === "error") throw new Error("This document could not be opened. Reload to try again.");
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
        return { workId, workspaceId, receipts: page, nextBeforeRevision: page.at(-1) && page.at(-1)!.revision > 1 ? page.at(-1)!.revision : null };
      },
    };
  }, [state]);
  const download = () => {
    const content = saved.current?.text ?? "Private mediation agreement template. Fictional preview content.";
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = "mediation-agreement-preview.txt"; link.click(); URL.revokeObjectURL(url);
  };
  return <DocumentExperience workspaceId={workspaceId} workId={workId} readOnly={state === "read-only" || state === "denied"} transport={transport}
    receiptLabel={receipt => receipt.after.text.split("\n")[0]}
    receiptActor={receipt => receipt.actorId === "preview-agency" ? "North Studio · edited" : "Sheri · uploaded"}
    context={<>
      <StSection title="Who can open it"><StRows><StRow title="Sheri · owner" /><StRow title="North Studio · agency" /></StRows></StSection>
      <StSection title="Opened"><StRows><StRow title="Sheri downloaded v4" end={<StMono>Oct 3</StMono>} /><StRow title="North Studio viewed v3" end={<StMono>Sep 22</StMono>} /></StRows></StSection>
      <StPill variant="soft" onClick={download}>Download preview text</StPill>
    </>} />;
}
