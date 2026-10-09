// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { WebsiteArchivedVersions } from "@/experience/websites/WebsiteArchivedVersions";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";
describe("read-only legacy native Versions",()=>{
  it("shows unresolved history and scoped capture download without restore or publication controls",async()=>{
    const record=fixtureRebuild();
    record.legacyArchives=[{archiveId:"a".repeat(64),workspaceId:record.workspaceId,sourceWorkId:"11111111-1111-4111-8111-111111111111",sourceVersion:1,sourceRevision:4,sourceDigest:"b".repeat(64),evidenceDigest:"c".repeat(64),retainedCandidates:1,unresolvedCandidates:2}];
    record.legacyArchivesNextCursor="d".repeat(64);
    const container=document.createElement("div");document.body.appendChild(container);const root=createRoot(container);
    await act(async()=>root.render(createElement(WebsiteArchivedVersions,{record})));
    expect(container.textContent).toContain("2 historical bodies unavailable");
    expect(container.querySelector("button")).toBeNull();
    const link=container.querySelector("a")!;expect(link.getAttribute("href")).toContain(`/api/websites/${record.workId}/archives/${"a".repeat(64)}`);
    expect(link.getAttribute("href")).toContain(`workspaceId=${record.workspaceId}`);expect(link.getAttribute("href")).toContain("download=1");
    expect(container.textContent).toContain("Read more retained capture records");
    await act(async()=>root.unmount());container.remove();
  });
  it("keeps missing archive storage visibly unknown",async()=>{
    const record=fixtureRebuild();record.legacyArchivesUnavailable=true;
    const container=document.createElement("div");document.body.appendChild(container);const root=createRoot(container);
    await act(async()=>root.render(createElement(WebsiteArchivedVersions,{record})));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("availability is unknown");
    expect(container.querySelector("a")).toBeNull();await act(async()=>root.unmount());container.remove();
  });
});
