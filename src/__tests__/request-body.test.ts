import { describe, expect, it } from "vitest";
import { readJsonObject, readOptionalJsonObject, readJsonArray } from "@/lib/request-body";

function req(body: string) {
  return new Request("http://localhost/x", { method: "POST", body });
}

describe("readJsonObject", () => {
  it("returns a plain object", async () => {
    expect(await readJsonObject(req(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
  });

  it("rejects arrays, primitives, and malformed JSON with null", async () => {
    expect(await readJsonObject(req(JSON.stringify([1, 2])))).toBeNull();
    expect(await readJsonObject(req(JSON.stringify("hi")))).toBeNull();
    expect(await readJsonObject(req(JSON.stringify(5)))).toBeNull();
    expect(await readJsonObject(req(JSON.stringify(null)))).toBeNull();
    expect(await readJsonObject(req("{not valid json"))).toBeNull();
  });
});

describe("readOptionalJsonObject", () => {
  it("returns undefined for an empty / whitespace body", async () => {
    expect(await readOptionalJsonObject(req(""))).toBeUndefined();
    expect(await readOptionalJsonObject(req("   \n "))).toBeUndefined();
  });

  it("returns a parsed object (incl. text/plain sendBeacon bodies)", async () => {
    expect(await readOptionalJsonObject(req(JSON.stringify({ event: "page-view" })))).toEqual({
      event: "page-view",
    });
  });

  it("rejects arrays and malformed JSON with null", async () => {
    expect(await readOptionalJsonObject(req(JSON.stringify([1])))).toBeNull();
    expect(await readOptionalJsonObject(req("{broken"))).toBeNull();
  });
});

describe("readJsonArray", () => {
  it("returns an array", async () => {
    expect(await readJsonArray(req(JSON.stringify([1, 2, 3])))).toEqual([1, 2, 3]);
  });

  it("rejects objects and malformed JSON with null", async () => {
    expect(await readJsonArray(req(JSON.stringify({ a: 1 })))).toBeNull();
    expect(await readJsonArray(req("nope"))).toBeNull();
  });
});
