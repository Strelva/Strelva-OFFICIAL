import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

const mockRedis = makeRedisMock();
const store = new Map<string, unknown>();

vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));
vi.mock("@/lib/storage", () => ({
  getContent: async (section: string, tenant: string) => store.get(`${tenant}:${section}`) ?? null,
  setContent: async (section: string, value: unknown, tenant: string) => {
    store.set(`${tenant}:${section}`, value);
  },
  recordSectionUpdate: async () => {},
  appendVersion: async () => {},
}));

import { appendTestimonial } from "@/lib/testimonials";
import type { TestimonialsContent } from "@/lib/types";

function read(tenant: string): TestimonialsContent {
  return (store.get(`${tenant}:testimonials`) as TestimonialsContent) ?? { sectionLabel: "", headline: "", testimonials: [] };
}

beforeEach(() => {
  store.clear();
  mockRedis.store.clear();
  mockRedis.zsets.clear();
});

describe("appendTestimonial — atomic append", () => {
  it("appends a testimonial and seeds the section if empty", async () => {
    const r = await appendTestimonial("t1", { quote: "Great work", author: "Sam", location: "Buffalo" });
    expect(r.ok).toBe(true);
    const t = read("t1");
    expect(t.testimonials).toHaveLength(1);
    expect(t.testimonials[0]).toMatchObject({ quote: "Great work", author: "Sam", location: "Buffalo" });
    expect(t.sectionLabel).toBeTruthy(); // seeded base
  });

  it("preserves existing testimonials (no overwrite of the section)", async () => {
    store.set("t1:testimonials", {
      sectionLabel: "Reviews",
      headline: "Loved",
      testimonials: [{ id: "a", quote: "First", author: "Ann", location: "x" }],
    });
    await appendTestimonial("t1", { quote: "Second", author: "Bob", location: "y" });
    const t = read("t1");
    expect(t.testimonials.map((x) => x.author)).toEqual(["Ann", "Bob"]);
    expect(t.headline).toBe("Loved"); // section metadata untouched
  });

  it("two concurrent appends BOTH land (the lost-update fix)", async () => {
    const [a, b] = await Promise.all([
      appendTestimonial("t1", { quote: "Q1", author: "One", location: "" }),
      appendTestimonial("t1", { quote: "Q2", author: "Two", location: "" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const authors = read("t1").testimonials.map((x) => x.author).sort();
    expect(authors).toEqual(["One", "Two"]);
  });

  it("is idempotent on an exact double-submit (same quote+author)", async () => {
    await appendTestimonial("t1", { quote: "Same", author: "Dup", location: "a" });
    await appendTestimonial("t1", { quote: "Same", author: "Dup", location: "a" });
    expect(read("t1").testimonials).toHaveLength(1);
  });
});
