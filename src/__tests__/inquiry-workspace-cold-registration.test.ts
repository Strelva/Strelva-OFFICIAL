import { afterEach, expect, it, vi } from "vitest";
import type { WorkspacePorts } from "@/lib/workspace-ports";

const slot = Symbol.for("strelva.workspace-ports");
type Registry = { [slot]?: WorkspacePorts };
const registry = globalThis as Registry;
const original = registry[slot];

afterEach(() => {
  registry[slot] = original;
  vi.resetModules();
});

it("the inquiry request edge registers the actual governed publication ports in a cold runtime", async () => {
  vi.resetModules();
  delete registry[slot];
  const { workspacePorts, workspacePortsRegistered } = await import("@/lib/workspace-ports");
  expect(workspacePortsRegistered()).toBe(false);
  expect(() => workspacePorts()).toThrow(/not registered/);

  const route = await import("@/app/api/inquiry-workspace/route");
  expect(route.POST).toBeTypeOf("function");
  expect(workspacePortsRegistered()).toBe(true);
  const { workspacePortLoaders } = await import("@/server/workspace-ports");
  expect(workspacePorts()).toBe(workspacePortLoaders);
  const inquiry = await workspacePorts().inquiries();
  expect(inquiry.authorizeInquiryPublicationActor).toBeTypeOf("function");
  expect(inquiry.executeInquiryPublication).toBeTypeOf("function");
}, 30_000);
