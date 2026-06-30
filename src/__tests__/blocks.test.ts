import { describe, expect, it } from "vitest";
import {
  isBlockType,
  validateBlockProps,
  getBlockDefinition,
  BLOCK_TYPES,
} from "@/lib/blocks/registry";

describe("block registry", () => {
  it("distinguishes namespaced blocks from legacy template sections", () => {
    expect(isBlockType("block:heading")).toBe(true);
    expect(isBlockType("block:cta")).toBe(true);
    // Critical: a block id must never collide with a template section type.
    expect(isBlockType("hero")).toBe(false); // template section, not the block
    expect(isBlockType("services")).toBe(false);
    expect(isBlockType("heading")).toBe(false); // un-namespaced is not a block
  });

  it("coerces and fills props from the schema", () => {
    const p = validateBlockProps("block:heading", { text: "Hi", level: "3" });
    expect(p.text).toBe("Hi");
    expect(p.level).toBe(3); // string coerced to number
    expect(p.align).toBe("left"); // default filled
  });

  it("fills every default for an empty block", () => {
    const p = validateBlockProps("block:button", {});
    expect(p.label).toBe("Get started");
    expect(p.href).toBe("#");
    expect(p.style).toBe("primary");
  });

  it("returns an empty object for an unknown type", () => {
    expect(validateBlockProps("does-not-exist", { x: 1 })).toEqual({});
  });

  it("ships a real core set", () => {
    expect(BLOCK_TYPES.length).toBeGreaterThanOrEqual(8);
  });

  // The contract that keeps editor + AI + renderer in sync: a block's own
  // defaults must satisfy its own schema and expose a field per editable prop.
  it("every block's defaults satisfy its schema and cover its fields", () => {
    for (const type of BLOCK_TYPES) {
      const def = getBlockDefinition(type)!;
      expect(def.schema.safeParse(def.defaults).success, `${type} defaults invalid`).toBe(true);
      for (const field of def.fields) {
        expect(field.key in def.defaults, `${type}.${field.key} missing from defaults`).toBe(true);
      }
    }
  });
});
