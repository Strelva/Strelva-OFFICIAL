import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentSourceIsPostgres } from "@/lib/db/source-flags";

const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const ORIGINAL_CONTENT_SOURCE = process.env.CONTENT_SOURCE;

function set(vercelEnv: string | undefined, contentSource: string | undefined) {
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  if (contentSource === undefined) delete process.env.CONTENT_SOURCE;
  else process.env.CONTENT_SOURCE = contentSource;
}

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.CONTENT_SOURCE;
});

afterEach(() => {
  if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  if (ORIGINAL_CONTENT_SOURCE === undefined) delete process.env.CONTENT_SOURCE;
  else process.env.CONTENT_SOURCE = ORIGINAL_CONTENT_SOURCE;
});

describe("contentSourceIsPostgres runtime guard", () => {
  it("throws in production when content source is sanity (silently-stale content)", () => {
    set("production", "sanity");
    expect(() => contentSourceIsPostgres()).toThrow(/Postgres-only/);
  });

  it("throws in production when content source is unset", () => {
    set("production", undefined);
    expect(() => contentSourceIsPostgres()).toThrow(/CONTENT_SOURCE is "unset"/);
  });

  it("does NOT throw in production when content source is postgres (the legit prod config)", () => {
    set("production", "postgres");
    expect(contentSourceIsPostgres()).toBe(true);
  });

  it("does NOT throw on a preview deploy even with a non-postgres source", () => {
    set("preview", "sanity");
    expect(contentSourceIsPostgres()).toBe(false);
  });

  it("does NOT throw on a preview deploy with postgres", () => {
    set("preview", "postgres");
    expect(contentSourceIsPostgres()).toBe(true);
  });

  it("does NOT throw when VERCEL_ENV is unset (local dev / test) with a non-postgres source", () => {
    set(undefined, "dev-file");
    expect(contentSourceIsPostgres()).toBe(false);
  });

  it("does NOT throw when VERCEL_ENV is unset and content source is unset", () => {
    set(undefined, undefined);
    expect(contentSourceIsPostgres()).toBe(false);
  });
});
