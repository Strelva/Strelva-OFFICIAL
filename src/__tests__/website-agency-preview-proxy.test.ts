import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy from "@/proxy";
import { WEBSITE_PREVIEW_CSP } from "@/lib/website-preview-policy";

const path = "/api/agency-website-draft-access";
const request = (target: string) => new NextRequest(`https://app.strelva.com${target}`, { headers: { host: "app.strelva.com" } });
beforeEach(() => {
  vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "1");
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated agency candidate preview framing", () => {
  it("permits only same-origin framing with the strict private-preview CSP for the exact enabled preview query", async () => {
    const response = await proxy(request(`${path}?document=preview&bindingId=synthetic&page=%2Fabout`));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Content-Security-Policy")).toBe(WEBSITE_PREVIEW_CSP);
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'none'");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("script-src");
  });
  it.each([path, `${path}?document=1`, `${path}?document=Preview`, `${path}?document=preview&document=1`, `${path}/nested?document=preview`, "/api/other?document=preview"])("keeps framing denied for %s", async target => {
    const response = await proxy(request(target));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).not.toBe(WEBSITE_PREVIEW_CSP);
  });
  it.each(["STRELVA_WEBSITE_REBUILD_RELEASE", "STRELVA_WORKSPACE_RELEASE"])("preserves the legacy denied headers while %s is off", async flag => {
    vi.stubEnv(flag, "0");
    const response = await proxy(request(`${path}?document=preview`));
    const baseline = await proxy(request(path));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect([...response.headers.entries()]).toEqual([...baseline.headers.entries()]);
  });
  it("preserves existing v1 private website preview framing while the new release is off", async () => {
    vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "0");
    const response = await proxy(request("/api/websites/11111111-1111-4111-8111-111111111111/preview"));
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Content-Security-Policy")).toBe(WEBSITE_PREVIEW_CSP);
  });
});
