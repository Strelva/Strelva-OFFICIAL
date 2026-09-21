// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationalInbox } from "@/experience/operations/OperationalInbox";

type Pending = { url: string; signal: AbortSignal; resolve: (value: Response) => void; reject: (error: Error) => void };
let container: HTMLDivElement;
let root: Root;
let pending: Pending[];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = [];
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => new Promise<Response>((resolve, reject) => {
    pending.push({ url, signal: options.signal as AbortSignal, resolve, reject });
  })));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(mode: "internal" | "assigned") {
  await act(async () => root.render(createElement(OperationalInbox, { mode })));
}
async function respond(index: number, body: unknown, status = 200) {
  await act(async () => pending[index]!.resolve(new Response(JSON.stringify(body), { status })));
}
const assignment = {
  assignmentId: "assignment-1", workspaceId: "workspace-1", workspaceName: "Harbor Dental",
  workId: "work-1", title: "Review the opening procedure", status: "offered", assigneeKind: "staff",
  sponsorEmail: "owner@example.invalid", expiresAt: "2026-10-01T12:00:00Z", deepLink: "/workspace?assignment=assignment-1",
};

describe("operational inbox request lifecycle", () => {
  it("loads assigned work through the API's supported view and preserves the exact link", async () => {
    await render("assigned");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Checking exact work");
    expect(pending[0]!.url).toBe("/api/operations/inbox?view=inbox");
    await respond(0, { inbox: { assignments: [assignment] } });
    expect(container.textContent).toContain(assignment.title);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(assignment.deepLink);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("replaces a permission error with loading on retry, then displays the empty state", async () => {
    await render("internal");
    expect(pending[0]!.url).toBe("/api/operations/inbox?view=internal");
    await respond(0, { error: "This internal work view is unavailable to your account." }, 403);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("unavailable to your account");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await respond(1, { exceptions: [], inbox: { assignments: [] } });
    expect(container.textContent).toContain("No durable failed or uncertain execution");
    expect(container.textContent).toContain("No pending assignments");
  });

  it("aborts the prior mode and ignores its late response without exposing stale assignments", async () => {
    await render("internal");
    await render("assigned");
    expect(pending[0]!.signal.aborted).toBe(true);
    await respond(0, { inbox: { assignments: [assignment] } });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain(assignment.title);
    await respond(1, { inbox: { assignments: [] } });
    expect(container.textContent).toContain("No pending assignments");
    await render("internal");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain("No pending assignments");
  });

  it("discards a completed mode's data and ignores aborted failures", async () => {
    await render("internal");
    await respond(0, { inbox: { assignments: [assignment] } });
    await render("assigned");
    expect(container.textContent).not.toContain(assignment.title);
    await render("internal");
    await act(async () => pending[1]!.reject(new Error("Outdated request failed")));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await respond(2, { inbox: { assignments: [assignment] } });
    expect(container.textContent).toContain(assignment.title);
    await act(async () => root.render(null));
    expect(pending[2]!.signal.aborted).toBe(true);
  });
});
