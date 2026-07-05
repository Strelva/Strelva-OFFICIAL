import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { buildLeadPayload, submitLead } from "../../custom-repo-starter/ScaffoldLeadForm";

describe("buildLeadPayload", () => {
  it("builds the exact v1 leads shape (name + source) and trims", () => {
    const payload = buildLeadPayload({ name: "  Sarah Chen  " }, "contact-form");
    expect(payload).toEqual({ name: "Sarah Chen", source: "contact-form" });
  });

  it("includes a valid email and message when present", () => {
    const payload = buildLeadPayload(
      { name: "Sarah", email: " s@x.com ", message: " Saturday? " },
      "quote",
    );
    expect(payload).toEqual({ name: "Sarah", email: "s@x.com", message: "Saturday?", source: "quote" });
  });

  it("folds a phone number into the message (the v1 contract has no phone field)", () => {
    const payload = buildLeadPayload(
      { name: "Sarah", phone: "716-555-0100", message: "Do you do Saturdays?" },
      "contact-form",
    );
    expect(payload.message).toBe("Phone: 716-555-0100\n\nDo you do Saturdays?");
    // no top-level phone key — it must never appear in the wire body
    expect("phone" in payload).toBe(false);
  });

  it("omits message entirely when neither phone nor message is given", () => {
    const payload = buildLeadPayload({ name: "Sarah", email: "s@x.com" }, "contact-form");
    expect(payload.message).toBeUndefined();
    expect(payload).toEqual({ name: "Sarah", email: "s@x.com", source: "contact-form" });
  });
});

describe("submitLead", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the folded payload to /api/v1/leads/{tenant} as JSON", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const result = await submitLead(
      { name: "Sarah", email: "s@x.com", phone: "716-555-0100", message: "hi" },
      { tenant: "gldf", baseUrl: "https://app.strelva.com", source: "contact-form" },
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.strelva.com/api/v1/leads/gldf");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      name: "Sarah",
      email: "s@x.com",
      message: "Phone: 716-555-0100\n\nhi",
      source: "contact-form",
    });
  });

  it("fails soft with a friendly message on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await submitLead(
      { name: "Sarah" },
      { tenant: "gldf", baseUrl: "https://app.strelva.com", errorMessage: "Try again please." },
    );

    expect(result).toEqual({ ok: false, error: "Try again please." });
  });

  it("fails soft (never throws) on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await submitLead(
      { name: "Sarah" },
      { tenant: "gldf", baseUrl: "https://app.strelva.com" },
    );

    expect(result.ok).toBe(false);
  });

  it("returns a config error and never fetches when env is unset", async () => {
    const result = await submitLead({ name: "Sarah" }, { tenant: null, baseUrl: null });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
