"use client";

import { ContentWorkspace } from "./ContentWorkspace";
import type { SectionData } from "./ContentBrowser";

const EDITOR_SECTION_DATA: Record<string, SectionData> = {
  hero: {
    preview: "A synthetic headline and image for the isolated editor journey.",
    status: "configured",
    chatPrompt: "Update the synthetic hero",
  },
  products: {
    preview: "Fictional products",
    status: "configured",
    chatPrompt: "Update the synthetic products",
  },
  story: {
    preview: "A fictional studio story",
    status: "configured",
    chatPrompt: "Update the synthetic story",
  },
};

/**
 * Real Website editor controls over fictional content. The route that mounts
 * this component is development-only; browser acceptance intercepts its API
 * boundary so no tenant, storage, upload, publish, or provider call is made.
 */
export function ManagedEditorPreview() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-gray-border px-6 py-3 text-[12px] text-gray-muted">
        Local Website editor · fictional content · no live actions
      </div>
      <div className="min-h-0 flex-1">
        <ContentWorkspace
          siteName="Elmwood Studio"
          ownerName="Alex Morgan"
          sectionData={EDITOR_SECTION_DATA}
          timestamps={{}}
        />
      </div>
    </div>
  );
}
