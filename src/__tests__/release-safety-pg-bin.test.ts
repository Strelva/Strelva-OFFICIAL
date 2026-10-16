import { afterEach, describe, expect, it } from "vitest";
import { pgBinary } from "../../scripts/release-safety/postgres";

describe("release-safety PostgreSQL binary selection", () => {
  const saved = process.env.STRELVA_PG_BIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.STRELVA_PG_BIN;
    else process.env.STRELVA_PG_BIN = saved;
  });

  it("keeps the PostgreSQL 18 default (or PATH) when no override is set", () => {
    delete process.env.STRELVA_PG_BIN;
    const resolved = pgBinary("psql");
    expect(resolved === "psql" || resolved === "/opt/homebrew/opt/postgresql@18/bin/psql").toBe(true);
  });

  it("refuses an override directory that lacks the binary instead of silently falling back", () => {
    process.env.STRELVA_PG_BIN = "/nonexistent/strelva-pg-bin";
    expect(() => pgBinary("initdb")).toThrow("STRELVA_PG_BIN has no initdb");
  });
});
