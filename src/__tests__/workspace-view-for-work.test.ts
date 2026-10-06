import { describe, expect, it } from "vitest";
import { selectWorkspaceLocation, viewForWork } from "@/experience/workspace/workspace-selection";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

type Input = Parameters<typeof selectWorkspaceLocation>[1];
const empty: Input = { work: [], products: [], workspaceExitReadStatus: "available" };
const work = (productId: string) => ({ id: "saved", productId, title: "Saved result" }) as WorkspaceSnapshot["work"][number];

describe("viewForWork: one productId → view mapping for state and URL", () => {
  it.each([
    ["tracker", "tracker"], ["documents", "document"], ["work_plans", "plan"],
    ["websites", "websites"], ["custom-applications", "custom-applications"], ["onboarding", "onboarding"],
    ["applications", "applications"], ["scheduling", "scheduling"], ["investigations", "investigations"],
    ["operations", "operations"], ["product-learning", "product-learning"],
    ["ai_visibility", "work"], ["research", "work"], ["managed_presence", "work"], [undefined, "work"],
  ] as const)("opens a saved %s in the %s view, and a reload of that URL lands in the same view", (productId, view) => {
    expect(viewForWork(productId)).toBe(view);
    if (!productId) return;
    // The URL pushed from viewForWork must reopen the same view the state was set to.
    const reloaded = selectWorkspaceLocation(new URLSearchParams(`work=saved&view=${viewForWork(productId)}`), { ...empty, work: [work(productId)] });
    expect(reloaded.view).toBe(view);
    expect(reloaded.selectedWorkId).toBe("saved");
  });
});
