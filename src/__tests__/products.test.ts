import { describe, it, expect, beforeEach, vi } from "vitest";

const mockListEntries = vi.fn();
const mockGetContent = vi.fn();

vi.mock("@/lib/cms/collections-service", () => ({
  listEntriesForType: (...a: unknown[]) => mockListEntries(...a),
}));
vi.mock("@/lib/storage", () => ({
  getContent: (...a: unknown[]) => mockGetContent(...a),
}));

import { getProducts } from "@/lib/products";

beforeEach(() => {
  mockListEntries.mockReset();
  mockGetContent.mockReset();
});

describe("getProducts — unified read", () => {
  it("prefers Model B (Collections) when present", async () => {
    mockListEntries.mockResolvedValue([
      { slug: "mango", status: "published", data: { name: "Mango", priceCents: 599, currency: "USD", images: ["a.jpg"], inStock: true } },
    ]);
    const products = await getProducts("t1");
    expect(mockGetContent).not.toHaveBeenCalled();
    expect(products).toEqual([
      { name: "Mango", description: undefined, priceCents: 599, currency: "USD", imageUrl: "a.jpg", inStock: true, checkoutUrl: undefined },
    ]);
  });

  it("falls back to legacy Model A and parses the free-text price to cents", async () => {
    mockListEntries.mockResolvedValue([]);
    mockGetContent.mockResolvedValue({
      products: [
        { name: "Dried Mango", description: "Tasty", price: "5.99", imageUrl: "m.jpg", stripePaymentLink: "https://buy", comingSoon: false, featured: true },
        { name: "Soldout Item", price: "$12.50", comingSoon: true },
      ],
    });
    const products = await getProducts("t1");
    expect(products[0]).toMatchObject({ name: "Dried Mango", priceCents: 599, currency: "USD", checkoutUrl: "https://buy", inStock: true, featured: true });
    expect(products[1]).toMatchObject({ name: "Soldout Item", priceCents: 1250, inStock: false });
  });

  it("returns [] when neither model has products", async () => {
    mockListEntries.mockResolvedValue([]);
    mockGetContent.mockResolvedValue({});
    expect(await getProducts("t1")).toEqual([]);
  });
});
