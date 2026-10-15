import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null, redis: null }));

import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";

const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons: Array<{ path: string; schedule: string }>;
};
const schedule = (name: string) => crons.find((cron) => cron.path === `/api/cron/${name}`)?.schedule;

describe("cron schedules", () => {
  it("never runs a job every minute", () => {
    expect(crons.filter((cron) => cron.schedule === "* * * * *")).toEqual([]);
  });

  it("gives every heartbeat-recording cron a max age", () => {
    for (const cron of crons) {
      const name = cron.path.split("/").pop() as string;
      // payment-holds records no heartbeat yet; a table entry without one would
      // read as stale forever, so it is left to the lane that owns that route.
      if (!readFileSync(`src/app${cron.path}/route.ts`, "utf8").includes("recordHeartbeat")) continue;
      expect(Object.keys(CRON_MAX_AGE_SECONDS), cron.path).toContain(name);
    }
  });

  it("checks domain verification every 5 minutes and tolerates 30", () => {
    expect(schedule("website-domain-verification")).toBe("*/5 * * * *");
    expect(CRON_MAX_AGE_SECONDS["website-domain-verification"]).toBe(30 * 60);
  });

  it("polls Yelp once a day", () => {
    const fields = schedule("poll-yelp")!.split(" ");
    expect(fields).toHaveLength(5);
    expect(fields.slice(2)).toEqual(["*", "*", "*"]);
    expect(fields[0]).toMatch(/^\d+$/);
    expect(fields[1]).toMatch(/^\d+$/);
  });
});
