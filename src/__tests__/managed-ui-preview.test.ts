import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/preview/strelva/website/api/[...path]/route";

const request = (path: string) => GET(new Request(`http://localhost/preview/strelva/website/api/${path}`), { params: Promise.resolve({ path: path.split("/") }) });
afterEach(() => vi.unstubAllEnvs());

describe("isolated managed interface preview", () => {
  it("returns no fixture data in production even with the preview flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    expect((await request("my-properties")).status).toBe(404);
    expect(POST().status).toBe(404);
  });

  it("keeps all mutations unavailable with preview enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    for (const mutation of [POST, PUT, PATCH, DELETE]) expect(mutation().status).toBe(405);
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
