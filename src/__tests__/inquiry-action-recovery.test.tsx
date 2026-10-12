// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceInquiryReply } from "@/experience/places/WorkspaceInquiryReply";
import { HeldInquiryActions } from "@/experience/places/HeldInquiryActions";

const workspaceId = "11111111-1111-4111-8111-111111111111", rowId = "22222222-2222-4222-8222-222222222222";
let root: Root, container: HTMLDivElement;
const receipt = { status: "accepted", providerMessageId: "fictional-provider", acceptedAt: "2026-10-09T00:00:00Z", retryable: false };
function button(name: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === name)!; }
function immutableDraft() {
  for (const field of [container.querySelector("input")!, container.querySelector("textarea")!]) {
    expect(field.disabled).toBe(false); expect(field.readOnly).toBe(true);
  }
}
async function mount(element: ReturnType<typeof createElement>) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(element));
}
async function write(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function reply(member = false) {
  await mount(createElement(WorkspaceInquiryReply, { workspaceId, rowId, name: "Pat", email: "pat@example.test", member }));
  await act(async () => button("Reply to Pat").click()); await write(container.querySelector("textarea")!, "Thanks Pat. Could you tell us more?");
}
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it("dispatches only one reply request ID for two same-batch send actions", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
  await reply(); const send = button("Approve and send reply"); send.focus(); await act(async () => { send.click(); send.click(); });
  const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies.map(item => item.requestId)).toEqual([expect.any(String)]); expect(bodies[0]).toMatchObject({ workspaceId, rowId, body: "Thanks Pat. Could you tell us more?" }); expect(bodies[0]).not.toHaveProperty("to");
  expect(container.querySelector("textarea")!.disabled).toBe(true);
  await act(async () => resolve(Response.json({ outcome: receipt })));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Sent. Delivery isn't confirmed yet.");
});

it.each([400, 401, 403, 404, 409, 429, 503])("retains an unknown attempt after a later %s denial and explicitly checks the same payload", async status => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    if (fetcher.mock.calls.length === 1) throw new Error("Response lost after claim");
    if (fetcher.mock.calls.length === 2) return Response.json({ error: "Current authority changed." }, { status });
    return Response.json({ outcome: receipt });
  }); vi.stubGlobal("fetch", fetcher); await reply();
  await act(async () => button("Approve and send reply").click());
  const original = fetcher.mock.calls[0]?.[1]?.body;
  await act(async () => button("Check this reply").click());
  immutableDraft(); expect(button("Close draft")).toBeUndefined();
  expect(button("Check this reply")).toBeDefined(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't be confirmed");
  await write(container.querySelector("textarea")!, "Must not change an attempted message");
  await write(container.querySelector("input")!, "Must not change the subject");
  await act(async () => button("Check this reply").click());
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(original); expect(fetcher.mock.calls[2]?.[1]?.body).toBe(original);
  expect(container.querySelector("textarea")!.value).toBe("Thanks Pat. Could you tell us more?"); expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each([400, 403, 404, 409])("does not assume an initial generic %s refusal precedes the durable reply claim", async status => {
  const fetcher = vi.fn(async () => Response.json({ error: "Claim readback unavailable." }, { status })); vi.stubGlobal("fetch", fetcher); await reply();
  await act(async () => button("Approve and send reply").click());
  immutableDraft(); expect(button("Check this reply")).toBeDefined();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't be confirmed"); expect(fetcher).toHaveBeenCalledOnce();
});

it.each([401, 429])("unlocks a first route-proven %s preclaim refusal for correction with a fresh attempt", async status => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => fetcher.mock.calls.length === 1 ? Response.json({ error: "Sign in or wait before sending." }, { status }) : Response.json({ outcome: receipt }));
  vi.stubGlobal("fetch", fetcher); await reply(true); await act(async () => button("Send reply").click());
  const first = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)); expect(container.querySelector("textarea")!.disabled).toBe(false);
  await write(container.querySelector("textarea")!, "Corrected ordinary reply"); await act(async () => button("Send reply").click());
  const next = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)); expect(next.requestId).not.toBe(first.requestId); expect(next.body).toBe("Corrected ordinary reply");
  expect(container.textContent).toContain("Prices, dates and promises need the owner’s approval");
});

it.each([{ status: "accepted" }, { ...receipt, providerMessageId: { bad: true } }, { ...receipt, retryable: true }])("refuses a malformed receipt instead of claiming success: %j", async malformed => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ outcome: malformed }))); await reply(); await act(async () => button("Approve and send reply").click());
  expect(container.querySelector('[role="status"]')).toBeNull(); expect(button("Check this reply")).toBeDefined(); immutableDraft();
});

it.each([
  ["sending", "This reply is being checked. Reload its receipt before sending anything else."],
  ["suppressed", "Email is paused. Nothing was sent."],
  ["accepted", "Sent. Delivery isn't confirmed yet."],
  ["delivered", "Delivered to the recipient's email provider."],
  ["deferred", "Sent. The recipient's email provider delayed delivery."],
  ["bounced", "Sent, but the recipient's email provider bounced it. Check their address."],
  ["failed", "The provider reported a failure. This reply won't be sent again."],
  ["unknown", "The send couldn't be confirmed. Strelva must check the receipt before another attempt."],
])("preserves the established %s outcome promise", async (status, message) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ outcome: { ...receipt, status } }))); await reply(); await act(async () => button("Approve and send reply").click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe(message); expect(button("Check this reply")).toBeUndefined();
});

it("cannot close a reply draft in the same batch that dispatches its attempt", async () => {
  let resolve!: (value: Response) => void; vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; }))); await reply();
  const send = button("Approve and send reply"), close = button("Close draft"); await act(async () => { send.click(); close.click(); });
  expect(container.querySelector("textarea")).not.toBeNull(); expect(button("Reply to Pat")).toBeUndefined();
  await act(async () => resolve(Response.json({ outcome: receipt })));
});

it("does not claim an unknown held decision changed nothing or dispatch an alternative before readback", async () => {
  const fetcher = vi.fn(async () => { throw new Error("Response lost after committed release"); }); vi.stubGlobal("fetch", fetcher);
  await mount(createElement(HeldInquiryActions, { workspaceId, rowId, name: "Pat", mode: "held" }));
  await act(async () => button("Not spam, release it").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't be confirmed"); expect(container.textContent).not.toContain("Nothing changed");
  expect(button("It's spam").disabled).toBe(true); button("It's spam").click(); expect(fetcher).toHaveBeenCalledOnce();
  expect(button("Reload inquiries")).toBeDefined();
});

it("rejects duplicate or contradictory held decisions in the same React batch", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
  await mount(createElement(HeldInquiryActions, { workspaceId, rowId, name: "Pat", mode: "held" }));
  const release = button("Not spam, release it"), spam = button("It's spam"); await act(async () => { release.click(); spam.click(); });
  expect(fetcher).toHaveBeenCalledOnce(); await act(async () => resolve(Response.json({ status: "decided", state: "released" })));
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Released"); expect(container.textContent).toContain("nobody was emailed");
});

it.each([{ status: "decided", state: "confirmed_spam" }, { unrelated: true }])("requires the exact held decision acknowledgement before claiming success: %j", async malformed => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(malformed)));
  await mount(createElement(HeldInquiryActions, { workspaceId, rowId, name: "Pat", mode: "held" })); await act(async () => button("Not spam, release it").click());
  expect(container.querySelector('[role="status"]')).toBeNull(); expect(button("Reload inquiries")).toBeDefined();
});

it("does not apply a later release-gate 'Nothing sent' claim to the unknown original reply", async () => {
  const fetcher = vi.fn(async () => { if (fetcher.mock.calls.length === 1) throw new Error("Response lost"); return Response.json({ error: "Workspace replies aren't open yet. Nothing sent." }, { status: 503 }); });
  vi.stubGlobal("fetch", fetcher); await reply(); await act(async () => button("Approve and send reply").click()); await act(async () => button("Check this reply").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("couldn't be confirmed");
  expect(container.querySelector('[role="alert"]')?.textContent).not.toContain("Nothing sent"); immutableDraft();
});

it.each(["success", "unknown", "refusal"])("recovers a deferred reply %s only when the customer stayed", async result => {
  let resolve!: (value: Response) => void; const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher); await reply();
  const send = button("Approve and send reply"); send.focus(); await act(async () => send.click()); send.blur();
  await act(async () => resolve(result === "success" ? Response.json({ outcome: receipt }) : Response.json({ error: "Receipt unavailable" }, { status: result === "refusal" ? 401 : 503 })));
  expect(document.activeElement).toBe(result === "success" ? container.querySelector('[role="status"]') : result === "refusal" ? container.querySelector("input") : button("Check this reply"));
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(["success", "unknown", "refusal"])("preserves deliberate outside focus after deferred reply %s", async result => {
  let resolve!: (value: Response) => void; vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; }))); await reply();
  const send = button("Approve and send reply"); send.focus(); await act(async () => send.click());
  const outside = document.createElement("button"); document.body.append(outside); outside.focus();
  await act(async () => resolve(result === "success" ? Response.json({ outcome: receipt }) : Response.json({ error: "Receipt unavailable" }, { status: result === "refusal" ? 401 : 503 })));
  expect(document.activeElement).toBe(outside);
});

it("allows an ordinary member to correct an exact initial preclaim owner-approval refusal", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => fetcher.mock.calls.length === 1
    ? Response.json({ error: "Prices, dates and promises need the business owner’s approval." }, { status: 409 }) : Response.json({ outcome: receipt }));
  vi.stubGlobal("fetch", fetcher); await reply(true); await write(container.querySelector("textarea")!, "The price is $40."); await act(async () => button("Send reply").click());
  expect(container.querySelector("textarea")!.disabled).toBe(false); expect(container.querySelector('[role="alert"]')?.textContent).toContain("owner’s approval");
  const first = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)); await write(container.querySelector("textarea")!, "Thanks Pat. Could you tell us more?"); await act(async () => button("Send reply").click());
  const next = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)); expect(next.requestId).not.toBe(first.requestId); expect(next.body).toBe("Thanks Pat. Could you tell us more?");
});

it("does not unlock an unknown original reply after a later owner-approval refusal", async () => {
  const fetcher = vi.fn(async () => { if (fetcher.mock.calls.length === 1) throw new Error("Response lost"); return Response.json({ error: "Prices, dates and promises need the business owner’s approval." }, { status: 409 }); });
  vi.stubGlobal("fetch", fetcher); await reply(true); await act(async () => button("Send reply").click()); await act(async () => button("Check this reply").click());
  immutableDraft(); expect(button("Check this reply")).toBeDefined();
});

it("keeps attempted subject and body keyboard-focusable for inspection while retaining exact immutable payload", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", fetcher); await reply();
  const subject = container.querySelector("input")!, body = container.querySelector("textarea")!;
  await write(subject, "Full exact fictional pickup subject");
  const words = "Inspect the complete fictional inquiry body before checking its receipt. ".repeat(8);
  await write(body, words); const send = button("Approve and send reply"); send.focus();
  await act(async () => send.click());
  expect(subject.disabled).toBe(true); expect(body.disabled).toBe(true);
  const original = String(fetcher.mock.calls[0]?.[1]?.body);
  await act(async () => resolve(Response.json({ error: "Receipt unavailable" }, { status: 503 })));
  expect(subject.readOnly).toBe(true); expect(body.readOnly).toBe(true);
  expect(subject.disabled).toBe(false); expect(body.disabled).toBe(false);
  subject.focus(); expect(document.activeElement).toBe(subject); subject.select(); expect(subject.value.slice(subject.selectionStart!, subject.selectionEnd!)).toBe("Full exact fictional pickup subject");
  body.focus(); expect(document.activeElement).toBe(body); body.select(); expect(body.value.slice(body.selectionStart, body.selectionEnd)).toBe(words);
  await write(subject, "Must not replace attempted subject"); await write(body, "Must not replace attempted body");
  await act(async () => button("Check this reply").click());
  expect(subject.disabled).toBe(true); expect(body.disabled).toBe(true);
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(original);
  await act(async () => resolve(Response.json({ outcome: { ...receipt, status: "unknown" } })));
  expect(subject.disabled).toBe(false); expect(body.disabled).toBe(false);
  expect(subject.readOnly).toBe(true); expect(body.readOnly).toBe(true);
  expect(subject.value).toBe("Full exact fictional pickup subject"); expect(body.value).toBe(words);
  body.focus(); expect(document.activeElement).toBe(body); expect(fetcher).toHaveBeenCalledTimes(2);
});
