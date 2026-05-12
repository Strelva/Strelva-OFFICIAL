import { describe, expect, it } from "vitest";
import {
  formatEditablePathValue,
  getEditablePathValue,
  setEditablePathValue,
} from "../lib/editable-path";

describe("editable path helpers", () => {
  it("reads and updates simple scalar fields", () => {
    const source = { headline: "Old headline", nested: { value: "Original" } };

    expect(getEditablePathValue(source, "headline")).toBe("Old headline");
    expect(getEditablePathValue(source, "nested.value")).toBe("Original");

    expect(setEditablePathValue(source, "nested.value", "Updated")).toEqual({
      headline: "Old headline",
      nested: { value: "Updated" },
    });
    expect(source.nested.value).toBe("Original");
  });

  it("reads and updates indexed array object fields", () => {
    const source = {
      products: [
        { name: "Apple Chips", price: "5.99" },
        { name: "Berry Mix", price: "6.99" },
      ],
    };

    expect(getEditablePathValue(source, "products[1].name")).toBe("Berry Mix");

    expect(setEditablePathValue(source, "products[1].price", "7.49")).toEqual({
      products: [
        { name: "Apple Chips", price: "5.99" },
        { name: "Berry Mix", price: "7.49" },
      ],
    });
  });

  it("resolves featured array items for template edit hooks", () => {
    const source = {
      services: [
        { name: "Intro Stretch", featured: false },
        { name: "Assisted Stretch", featured: true },
      ],
    };

    expect(getEditablePathValue(source, "services[featured].name")).toBe("Assisted Stretch");

    expect(setEditablePathValue(source, "services[featured].name", "Signature Stretch")).toEqual({
      services: [
        { name: "Intro Stretch", featured: false },
        { name: "Signature Stretch", featured: true },
      ],
    });
  });

  it("formats values for selected-node AI context", () => {
    expect(formatEditablePathValue("Copy")).toBe("Copy");
    expect(formatEditablePathValue(149)).toBe("149");
    expect(formatEditablePathValue({ label: "Shop", href: "#products" })).toBe(
      '{"label":"Shop","href":"#products"}'
    );
    expect(formatEditablePathValue(undefined)).toBeUndefined();
  });
});
