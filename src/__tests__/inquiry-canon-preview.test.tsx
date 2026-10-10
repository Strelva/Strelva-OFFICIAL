import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InquiryCanonPreview } from "@/experience/workspace/preview/InquiryCanonPreview";
import { inquiryCanonState, inquiryCanonView } from "@/experience/workspace/preview/inquiry-canon-fixture";

const render = (state = "ready", view = "people") => renderToStaticMarkup(createElement(InquiryCanonPreview, {
  state: inquiryCanonState(state), view: inquiryCanonView(view), mode: "light",
}));

describe("isolated canon inquiry previews", () => {
  it("labels fictional replies and exposes one send action for the selected draft", () => {
    const html = render();
    expect(html).toContain("Fictional preview · no live actions");
    expect(html).toContain("Reply drafted by Strelva · not sent");
    expect(html.match(/>Send reply</g)).toHaveLength(1);
    expect(html).toContain("dana@example.invalid");
    expect(html).toContain("does not send email");
  });

  it.each(["loading", "empty", "error", "permission", "disconnected"])("never exposes a reply send control in the %s state", state => {
    expect(render(state)).not.toContain(">Send reply<");
  });

  it("names read-only limits without offering a live send", () => {
    const html = render("permission");
    expect(html).toContain("You can read inquiries but not reply");
    expect(html).toContain("Ask Sheri for reply access");
  });

  it("keeps rehearsal separate from approval and discloses the test inbox", () => {
    const html = render("ready", "record");
    expect(html).toContain("test@rehearsal.invalid");
    expect(html).toContain("made-up person, test inbox, nothing sent");
    expect(html).not.toContain(">Send reply<");
  });

  it("shows why a fictional inquiry was held and allows review", () => {
    const html = render("ready", "spam");
    expect(html).toContain("Held because: only a link, no name, sent to 40 sites this hour");
    expect(html).toContain(">Not spam<");
    expect(html).not.toContain(">Send reply<");
  });
});
