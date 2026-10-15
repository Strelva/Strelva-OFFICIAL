import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe(".env.example money switches", () => {
  const template = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
  it.each([
    ["STRELVA_CONNECT", "0"],
    ["STRELVA_AGENCY_PAY_LINKS", "0"],
    ["STRELVA_AGENCY_PAY_LINKS_LIVE", "0"],
    ["STRELVA_PAY_LINK_STORE", "redis"],
  ])("documents %s with the off value %s", (name, value) => {
    expect(template).toMatch(new RegExp(`^# ${name}=${value}$`, "m"));
  });
  it.each(["STRELVA_CONNECT_PROFILE_VERSION", "STRELVA_CONNECT_FEES_COLLECTOR", "STRELVA_CONNECT_LOSSES_COLLECTOR", "STRIPE_CONNECT_WEBHOOK_SECRET"])("lists %s as unset", name => {
    expect(template).toMatch(new RegExp(`^# ${name}=$`, "m"));
  });
});
