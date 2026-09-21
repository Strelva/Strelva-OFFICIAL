"use client";

import { useMemo } from "react";
import {
  applyTrackerCommand,
  createTracker,
  previewTrackerImport,
  trackerCommandSchema,
  trackerImportInputSchema,
  trackerMappingSelectionSchema,
} from "@/products/tracker";
import { TrackerExperience, type TrackerSavedResult, type TrackerTransport } from "../TrackerExperience";
import type { TrackerTemplateId } from "@/products/tracker/client";

/** Browser memory only. No server requests, provider calls or persistent storage. */
function localTransport(workspaceId: string): TrackerTransport {
  let saved: TrackerSavedResult | null = null;
  return {
    mode: "local-preview",
    async read(workId) {
      if (!saved || saved.workId !== workId) throw new Error("This preview tracker is no longer available.");
      return structuredClone(saved);
    },
    async write(body) {
      if (body.action === "preview") return { preview: previewTrackerImport(trackerImportInputSchema.parse(body.input)) };
      if (body.action === "create") {
        const preview = previewTrackerImport(trackerImportInputSchema.parse(body.input));
        const tracker = createTracker(preview, {
          trackerId: crypto.randomUUID(),
          actorId: "preview-user",
          title: typeof body.title === "string" ? body.title : undefined,
          mapping: trackerMappingSelectionSchema.array().max(50).parse(body.mapping),
        });
        saved = { workId: crypto.randomUUID(), workspaceId, tracker, canRecordExperiment: false };
        return structuredClone(saved);
      }
      if (body.action === "command" && saved && body.workId === saved.workId) {
        const command = trackerCommandSchema.parse({
          ...(body.command && typeof body.command === "object" ? body.command : {}),
          trackerId: saved.tracker.id,
          actorId: "preview-user",
          at: new Date().toISOString(),
        });
        saved = { ...saved, tracker: applyTrackerCommand(saved.tracker, command) };
        return structuredClone(saved);
      }
      throw new Error("That action is not available in this local preview.");
    },
  };
}

export function LocalTrackerPreview({ workspaceId, readOnly, templateId }: { workspaceId: string; readOnly: boolean; templateId?: TrackerTemplateId }) {
  const transport = useMemo(() => localTransport(workspaceId), [workspaceId]);
  return <>
    <p className="mx-auto max-w-5xl px-4 pt-4 text-sm text-gray-muted sm:px-8" role="note">Local rehearsal. Your CSV stays in this browser view. Changes reset when you leave or reload. Saved workspace sharing and R&amp;D records require sign-in.</p>
    <TrackerExperience workspaceId={workspaceId} readOnly={readOnly} transport={transport} templateId={templateId} />
  </>;
}
