import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PayLinkForm } from "@/app/pay/[slug]/PayLinkForm";

describe("PayLinkForm amounts", () => {
  it("shows cents on a fixed link that has them", () => {
    const html = renderToStaticMarkup(<PayLinkForm slug="harbor-site" amountCents={125050} />);
    expect(html).toContain("$1,250.50");
    expect(html).toContain("1,250.50");
    expect(html).not.toContain("$1,251");
  });

  it("keeps whole-dollar output unchanged", () => {
    const html = renderToStaticMarkup(<PayLinkForm slug="harbor-site" amountCents={125000} />);
    expect(html).toContain("$1,250");
    expect(html).not.toContain("1,250.00");
  });
});
