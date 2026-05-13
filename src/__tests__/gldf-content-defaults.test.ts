import { describe, expect, it } from "vitest";
import { gldfContentDefaults } from "@/lib/gldf-content-defaults";
import { foodBrandTemplate } from "@/components/templates/food-brand";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { transformSanityImages } from "@/lib/storage/content-store";

describe("GLDF content defaults", () => {
  it("matches the standalone GLDF storefront products", () => {
    expect(gldfContentDefaults.hero.headline).toBe("Great Lakes\nDried Fruit");
    expect(gldfContentDefaults.products.products).toHaveLength(4);
    expect(gldfContentDefaults.products.products.map((product) => product.name)).toEqual([
      "Apple Snaps with Cinnamon",
      "Tart Apple Snaps with Cinnamon",
      "Apple Snaps with Maple Syrup",
      "Tart Apple Snaps with Maple Syrup",
    ]);
    expect(gldfContentDefaults.products.products.every((product) => product.price === "5.99")).toBe(true);
    expect(gldfContentDefaults.products.products.every((product) => product.comingSoon === false)).toBe(true);
  });

  it("does not seed unverified testimonials, placeholder socials, or stock story images", () => {
    expect(gldfContentDefaults.testimonials.testimonials).toEqual([]);
    expect(gldfContentDefaults.contact.instagramUrl).toBe("");
    expect(gldfContentDefaults.contact.facebookUrl).toBe("");
    expect(gldfContentDefaults.story.imageUrl).toBe("");
    expect(gldfContentDefaults.story.secondaryImageUrl).toBe("");
  });

  it("keeps string product image URLs when no Sanity image object exists", () => {
    const transformed = transformSanityImages("products", {
      _id: "products-gldf",
      _type: "products",
      tenant: "gldf",
      ...gldfContentDefaults.products,
    });

    expect(transformed.products[0].imageUrl).toBe("/images/kraft-bag.png");
    expect(transformed.products[1].imageUrl).toBe("/images/product-bag.jpg");
  });

  it("keeps Scaffold Web food-brand page config aligned with the GLDF storefront layout", () => {
    const sharedConfig = getDefaultPageConfig("food-brand");

    expect(sharedConfig.home.sections).toEqual(foodBrandTemplate.defaultPageConfig.home.sections);
    expect(sharedConfig.home.sections.find((section) => section.type === "story")?.visible).toBe(false);
    expect(sharedConfig.home.sections.find((section) => section.type === "typographic-break")?.visible).toBe(false);
    expect(sharedConfig.home.sections.find((section) => section.type === "testimonials")?.visible).toBe(false);
  });
});
