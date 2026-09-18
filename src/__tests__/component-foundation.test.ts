import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tabs, TabsPanel } from "@/components/ui/Tabs";
import { TextInput } from "@/components/ui/TextInput";

describe("shared foundation contracts", () => {
  it("associates generated field help with caller descriptions and exposes invalid state", () => {
    const html = renderToStaticMarkup(createElement(TextInput, {
      id: "business-name",
      label: "Business name",
      helperText: "Use the name customers recognize.",
      "aria-describedby": "form-hint",
      error: "Enter a business name.",
    }));

    expect(html).toContain('for="business-name"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="form-hint business-name-error"');
    expect(html).toContain('id="business-name-error"');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('id="business-name-description"');
  });

  it("emits a tab and panel relationship with one roving tab stop", () => {
    const html = renderToStaticMarkup(createElement(
      Tabs,
      {
        id: "foundation-tabs",
        "aria-label": "Foundation examples",
        items: [
          { value: "first", label: "First", id: "foundation-tab-first", panelId: "foundation-panel-first" },
          { value: "second", label: "Second", id: "foundation-tab-second", panelId: "foundation-panel-second" },
        ],
        value: "first",
        onChange: () => undefined,
      },
    ));
    const panel = renderToStaticMarkup(createElement(TabsPanel, {
      id: "foundation-panel-first",
      tabId: "foundation-tab-first",
      active: true,
    }, "First panel"));

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Foundation examples"');
    expect(html).toContain('id="foundation-tab-first"');
    expect(html).toContain('aria-controls="foundation-panel-first"');
    expect(html).toContain('id="foundation-tab-second"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('tabindex="-1"');
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain('aria-labelledby="foundation-tab-first"');
    expect(panel).not.toContain(' hidden');
  });
});
