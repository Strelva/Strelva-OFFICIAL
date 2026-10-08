import { afterEach, describe, expect, it, vi } from "vitest";
import { submitInquiryForm, submitInquiryFormWithReceipt, type PublicInquiryForm } from "../../custom-repo-starter/inquiry-client";
const form: PublicInquiryForm = { schemaVersion: 1, capabilityId: "cap", version: 1, name: "Consult", form: { id: "form", title: "Contact", intro: "Contact us", component: "form", fields: [], disclosure: "Strelva" } };
afterEach(() => vi.unstubAllGlobals());
describe("portable inquiry confirmation receipt", () => {
  it("preserves old void success and exposes only additive valid proposed times", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    expect(await submitInquiryForm("https://app.strelva.test", "fixture", form, { name: "Dana" })).toBeUndefined();
    expect(await submitInquiryFormWithReceipt("https://app.strelva.test", "fixture", form, { name: "Dana" })).toEqual({});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, bookingOffer: { serviceName: "Consultation", slots: [{ label: "Friday 9 AM", chooseUrl: "/inquiry-booking/encoded.signature?slot=0" }] } })));
    expect((await submitInquiryFormWithReceipt("https://app.strelva.test", "fixture", form, { name: "Dana" })).bookingOffer).toEqual({ serviceName: "Consultation", slots: [{ label: "Friday 9 AM", chooseUrl: "https://app.strelva.test/inquiry-booking/encoded.signature?slot=0" }] });
  });
  it("discards malformed times and external or executable links without losing the captured inquiry", async () => {
    for (const chooseUrl of ["javascript:alert(1)", "https://other.test/inquiry-booking/a.b?slot=0", "/inquiry-booking/a.b?slot=7", "//other.test/path"]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, bookingOffer: { serviceName: "Consultation", slots: [{ label: "Friday", chooseUrl }] } })));
      expect(await submitInquiryFormWithReceipt("https://app.strelva.test", "fixture", form, { name: "Dana" })).toEqual({});
    }
  });
});
