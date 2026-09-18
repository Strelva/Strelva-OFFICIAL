import { describe, expect, it } from "vitest";
import { workspaceHome } from "@/experience/workspace/workspace-home";
import type { WorkspaceWork } from "@/experience/workspace/contracts";

const work = (id: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork => ({ id, workspaceId: "one", title: id, productId: "documents", resourceKind: "document", payload: null, input: {}, createdAt: "2026-09-12T12:00:00Z", ...extra });

describe("returning workspace home", () => {
  it("opens the created thing instead of repeating its creation plan", () => {
    const plan = work("plan", { productId: "work_plans", resourceKind: "plan", workPlan: { summary: "Create a procedure", status: "ready", outputCount: 1 } });
    const document = work("procedure", { sourceWorkId: "plan" });
    const home = workspaceHome([plan, document]);
    expect(home.results.map(item => item.id)).toEqual(["procedure"]);
    expect(home.attention).toEqual([]);
    expect(home.hasWork).toBe(true);
  });
  it("surfaces a recorded execution exception without inventing a failure for waiting work", () => {
    const failed = work("operation", { productId: "operations", operation: { status: "needs_attention" } });
    const waiting = work("waiting", { productId: "operations", operation: { status: "waiting" } });
    const proposed = work("proposed", { productId: "operations", operation: { status: "proposed" } });
    const home = workspaceHome([failed, waiting, proposed]);
    expect(home.attention.map(item => item.work.id)).toEqual(["operation", "proposed"]);
    expect(home.results.map(item => item.id)).toEqual(["waiting"]);
  });
  it("retains plans whose remaining outputs are unfinished or unknown", () => {
    const plan = work("plan", { productId: "work_plans", workPlan: { summary: "Create two results", status: "ready", outputCount: 2 } });
    const document = work("document", { sourceWorkId: "plan" });
    expect(workspaceHome([plan, document]).results.map(item => item.id)).toEqual(["plan", "document"]);
    const unknown = { ...plan, workPlan: { summary: "Older plan", status: "ready" as const } };
    expect(workspaceHome([unknown, document]).results.map(item => item.id)).toEqual(["plan", "document"]);
  });
  it("keeps unresolved decisions and unavailable saved results visible without inventing activity", () => {
    const plan = work("question", { productId: "work_plans", workPlan: { summary: "Choose the permitted audience", status: "needs_scoping" } });
    const unavailable = work("old", { unavailableReason: "This result cannot be displayed." });
    const home = workspaceHome([plan, unavailable, work("document")]);
    expect(home.attention.map(item => [item.work.id, item.reason])).toEqual([["question", "Choose the permitted audience"], ["old", "This result cannot be displayed."]]);
    expect(home.results.map(item => item.id)).toEqual(["document"]);
    expect(workspaceHome([])).toEqual({ hasWork: false, attention: [], results: [] });
  });
});
