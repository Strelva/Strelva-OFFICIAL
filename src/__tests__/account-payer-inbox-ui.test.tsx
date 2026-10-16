// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountPayerInbox } from "@/experience/workspace/AccountPayerInbox";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const transition = (over: Record<string, unknown>) => ({ id: "t1", workspaceId: "b1", workspaceName: "Harbor Dental", successorKind: "agency", canRespond: true, successorUserId: "", successorEmail: "", successorWorkspaceId: "a1", successorWorkspaceName: "North Studio", proposerEmail: "dr.lin@harbordental.com", proposerName: "Dr. Amy Lin", status: "pending", proposedAt: "2026-10-14T15:12:00Z", resolvedAt: null, acceptedAt: null, ...over });
const job = { id: "j1", workspaceId: "b1", workspaceName: "Harbor Dental", productId: "website", resourceKind: "job", estimateCents: 6000, maxAuthorizedCents: 9600, reservedCents: 2400, usedCents: 1800, actualCents: null, actualKnown: false, status: "draft", createdAt: "2026-10-15T13:00:00Z" };

it("lists what waits once, names who asked and gives only the first item the yes", async () => {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  const request = vi.fn<typeof fetch>(async () => Response.json({ transitions: [transition({}), transition({ id: "t2", workspaceName: "Lakeview Mediation", proposerName: undefined, proposerEmail: "ruth@lakeviewmediation.com" })], current: null, pending: null, currentActorId: "maya", jobs: [job] }));
  await act(async () => root.render(<AccountPayerInbox request={request} />));
  expect(node.textContent).toContain("3 things wait for your yes.");
  expect(node.textContent).not.toContain("Waits for you");
  expect(node.textContent).toContain("Dr. Amy Lin asked North Studio to pay");
  expect(node.textContent).toContain("ruth@lakeviewmediation.com asked North Studio to pay");
  expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
  expect(node.querySelector("[data-xa-primary]")!.textContent).toContain("Accept $96.00 job limit");
  const accepts = [...node.querySelectorAll("button")].filter(item => item.textContent === "Accept");
  expect(accepts).toHaveLength(2);
});
