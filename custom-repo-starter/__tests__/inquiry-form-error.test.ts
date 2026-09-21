// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrelvaInquiryForm } from "../StrelvaInquiryForm";
import { submitInquiryForm, type PublicInquiryForm } from "../inquiry-client";

const definition: PublicInquiryForm = {
  schemaVersion: 1,
  capabilityId: "capability-example",
  version: 2,
  name: "Customer inquiries",
  form: {
    component: "form",
    id: "customer-inquiry",
    title: "Tell us what you need",
    intro: "We will help with the next step.",
    disclosure: "Strelva",
    fields: [
      { id: "name", label: "Name", kind: "text", component: "text_field", required: true },
      { id: "email", label: "Email", kind: "email", component: "email_field", required: true },
      { id: "message", label: "Message", kind: "textarea", component: "textarea_field", required: true },
    ],
  },
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("portable inquiry form errors", () => {
  it("preserves visitor input after an unavailable submission so it can be retried", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const onSubmit = (fields: Record<string, string>) => submitInquiryForm("https://app.example", "example", definition, fields);
    await act(async () => root.render(createElement(StrelvaInquiryForm, { definition, onSubmit })));

    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    const email = container.querySelector<HTMLInputElement>('input[name="email"]')!;
    const message = container.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!;
    setValue(name, "Avery Buyer");
    setValue(email, "avery@example.test");
    setValue(message, "Please call me about the listing.");

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      capabilityId: definition.capabilityId,
      capabilityVersion: definition.version,
      fields: {
        name: "Avery Buyer",
        email: "avery@example.test",
        message: "Please call me about the listing.",
      },
    });
    expect(name.value).toBe("Avery Buyer");
    expect(email.value).toBe("avery@example.test");
    expect(message.value).toBe("Please call me about the listing.");
    expect(container.textContent).toContain("Your request was not confirmed. Please try again.");
  });
});
