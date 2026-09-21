import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/preview/strelva/website/api/[...path]/route";

const request = (path: string) => {
  const url = new URL(`http://localhost/preview/strelva/website/api/${path}`);
  return GET(new Request(url), { params: Promise.resolve({ path: url.pathname.replace("/preview/strelva/website/api/", "").split("/") }) });
};
afterEach(() => vi.unstubAllEnvs());

describe("isolated managed interface preview", () => {
  it("returns no fixture data in production even with the preview flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    expect((await request("my-properties")).status).toBe(404);
    expect(POST().status).toBe(404);
    expect((await PUT(new Request("http://localhost/preview/strelva/website/api/content/hero"), { params: Promise.resolve({ path: ["content", "hero"] }) })).status).toBe(404);
  });

  it("keeps unknown mutations unavailable while allowing only fixture drafts", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    expect(POST().status).toBe(405);
    expect(PATCH().status).toBe(405);
    expect((await PUT(new Request("http://localhost/preview/strelva/website/api/agent"), { params: Promise.resolve({ path: ["agent"] }) })).status).toBe(405);
    expect((await DELETE(new Request("http://localhost/preview/strelva/website/api/agent"), { params: Promise.resolve({ path: ["agent"] }) })).status).toBe(405);
    const body = {
      headline: "Fixture draft",
      subheadline: "Synthetic studio",
      tagline: "Content stays inside this local fixture.",
      ctaText: "See the work",
      ctaLink: "#products",
      backgroundImageUrl: "/images/product-bag.jpg",
    };
    const draft = await PUT(new Request("http://localhost/preview/strelva/website/api/content/hero?draft=true", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ path: ["content", "hero"] }) });
    expect(draft.status).toBe(200);
    expect(await (await request("content/hero")).json()).toMatchObject({ headline: "A fictional headline" });
    expect(await (await request("content/hero?draft=true")).json()).toMatchObject({ headline: "Fixture draft" });
    expect((await DELETE(new Request("http://localhost/preview/strelva/website/api/publish"), { params: Promise.resolve({ path: ["publish"] }) })).status).toBe(200);
    expect((await request("agent")).status).toBe(404);
  });

  it("provides only synthetic reads with local property destinations", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    const response = await request("my-properties");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = await response.json();
    expect(data.properties).toHaveLength(1);
    expect(data.properties[0].href).toBe("/preview/strelva/website/dashboard/site");
    expect((await request("threads/foreign")).status).toBe(404);
  });
});
