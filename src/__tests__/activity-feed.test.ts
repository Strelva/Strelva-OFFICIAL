import { describe, expect, it } from "vitest";
import {
  buildActivityFeed,
  translateActivityEntry,
  selectStrelvaWork,
} from "@/lib/activity-feed";
import type { ActivityEntry } from "@/lib/storage/activity-store";

const NOW = new Date("2026-07-01T12:00:00.000Z");

function entry(over: Partial<ActivityEntry>): ActivityEntry {
  return {
    text: "AI updated hero",
    time: NOW.toISOString(),
    type: "ai",
    actor: "ai",
    ...over,
  };
}

describe("translateActivityEntry — real events → owner-plain lines", () => {
  it("maps an auto-published section update to its owner-plain line", () => {
    const item = translateActivityEntry(
      entry({ text: "AI updated hero", section: "hero", eventStatus: "auto_approved" })
    );
    expect(item?.label).toBe("Refreshed your homepage");
    expect(item?.kind).toBe("site");
  });

  it("maps each known section to a warm line", () => {
    expect(
      translateActivityEntry(entry({ section: "contact", eventStatus: "auto_approved" }))?.label
    ).toBe("Updated your contact details");
    expect(
      translateActivityEntry(entry({ section: "faq", eventStatus: "auto_approved" }))?.label
    ).toBe("Updated your FAQ");
    expect(
      translateActivityEntry(entry({ section: "theme", eventStatus: "auto_approved" }))?.kind
    ).toBe("look");
  });

  it("falls back to a generic site line for an unknown section", () => {
    const item = translateActivityEntry(
      entry({ section: "somethingNew", eventStatus: "auto_approved" })
    );
    expect(item?.label).toBe("Made an update to your site");
  });

  it("translates a published blog post with its title as detail", () => {
    const item = translateActivityEntry(
      entry({
        type: "content",
        section: "blog:spring-tips",
        text: 'published Blog entry "Spring lawn care tips"',
        actor: "ai",
      })
    );
    expect(item?.label).toBe("Published a new blog post");
    expect(item?.detail).toBe("Spring lawn care tips");
    expect(item?.kind).toBe("post");
  });

  it("translates a posted review reply with its star rating", () => {
    const item = translateActivityEntry(
      entry({
        type: "review-reply",
        text: "Replied to Dana's 5-star review on Google",
        actor: "ai",
      })
    );
    expect(item?.label).toBe("Replied to a new 5-star review");
    expect(item?.kind).toBe("review");
  });
});

describe("translateActivityEntry — noise & not-done filtering", () => {
  it("skips pending drafts (eventStatus pending)", () => {
    expect(
      translateActivityEntry(
        entry({ text: "AI drafted changes to hero (pending review)", section: "hero", eventStatus: "pending" })
      )
    ).toBeNull();
  });

  it("skips lines marked pending even without an eventStatus", () => {
    expect(
      translateActivityEntry(
        entry({ type: "newsletter", text: 'AI drafted newsletter: "July" (pending approval)' })
      )
    ).toBeNull();
  });

  it("skips internal cache-invalidation events", () => {
    expect(
      translateActivityEntry(
        entry({ type: "cache-invalidation", text: "Cache invalidation triggered" })
      )
    ).toBeNull();
  });

  it("skips saved-but-unpublished collection drafts", () => {
    expect(
      translateActivityEntry(
        entry({ type: "content", text: 'saved Blog entry "Draft post"', actor: "ai" })
      )
    ).toBeNull();
  });

  it("skips deleted collection entries", () => {
    expect(
      translateActivityEntry(
        entry({ type: "content", text: 'deleted Blog entry "Old post"', actor: "ai" })
      )
    ).toBeNull();
  });

  it("skips dashboard-only review reply drafts (not posted yet)", () => {
    expect(
      translateActivityEntry(
        entry({
          type: "review-reply",
          text: "AI saved a reply to Dana's 5-star review (dashboard only)",
          actor: "ai",
        })
      )
    ).toBeNull();
  });
});

describe("translateActivityEntry — Google Business posts (B5.5)", () => {
  it("renders a published GBP post with its text as detail", () => {
    const item = translateActivityEntry(
      entry({ type: "gbp-post", text: "Fall special: 20% off", actor: "admin" })
    );
    expect(item?.label).toBe("Posted an update to your Google listing");
    expect(item?.kind).toBe("post");
    expect(item?.detail).toBe("Fall special: 20% off");
  });

  it("renders GBP hours and photo updates", () => {
    expect(translateActivityEntry(entry({ type: "gbp-hours", text: "", actor: "admin" }))?.label).toBe(
      "Updated your hours on Google"
    );
    expect(translateActivityEntry(entry({ type: "gbp-photo", text: "", actor: "admin" }))?.label).toBe(
      "Added a photo to your Google listing"
    );
  });

  it("selectStrelvaWork keeps GBP entries even without an ai/admin actor", () => {
    const entries = [
      entry({ type: "gbp-post", text: "New post", actor: undefined }),
      entry({ type: "content", text: "owner edit", actor: "user" }),
    ];
    const selected = selectStrelvaWork(entries);
    expect(selected).toHaveLength(1);
    expect(selected[0].type).toBe("gbp-post");
  });
});

describe("buildActivityFeed — grouping & empty state", () => {
  const iso = (d: string) => new Date(d).toISOString();

  it("groups items by Today / This week / Earlier", () => {
    const groups = buildActivityFeed(
      [
        entry({ section: "hero", eventStatus: "auto_approved", time: iso("2026-07-01T09:00:00Z") }), // today
        entry({ section: "faq", eventStatus: "auto_approved", time: iso("2026-06-28T09:00:00Z") }), // this week
        entry({ section: "contact", eventStatus: "auto_approved", time: iso("2026-06-01T09:00:00Z") }), // earlier
      ],
      { now: NOW }
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "This week", "Earlier"]);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].label).toBe("Refreshed your homepage");
  });

  it("drops empty groups", () => {
    const groups = buildActivityFeed(
      [entry({ section: "hero", eventStatus: "auto_approved", time: iso("2026-07-01T09:00:00Z") })],
      { now: NOW }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
  });

  it("returns an empty array (empty state) when nothing is owner-meaningful", () => {
    const groups = buildActivityFeed(
      [
        entry({ type: "cache-invalidation", text: "Cache invalidation" }),
        entry({ type: "content", text: 'saved Blog entry "Draft"' }),
        entry({ text: "AI drafted changes to hero (pending review)", eventStatus: "pending" }),
      ],
      { now: NOW }
    );
    expect(groups).toEqual([]);
  });

  it("caps the number of items shown", () => {
    const many: ActivityEntry[] = Array.from({ length: 20 }, (_, i) =>
      entry({ section: "hero", eventStatus: "auto_approved", time: iso(`2026-07-01T${String(i % 12).padStart(2, "0")}:00:00Z`) })
    );
    const total = buildActivityFeed(many, { now: NOW }).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBeLessThanOrEqual(8);
  });

  it("orders newest first", () => {
    const groups = buildActivityFeed(
      [
        entry({ section: "faq", eventStatus: "auto_approved", time: iso("2026-07-01T08:00:00Z") }),
        entry({ section: "hero", eventStatus: "auto_approved", time: iso("2026-07-01T10:00:00Z") }),
      ],
      { now: NOW }
    );
    expect(groups[0].items[0].label).toBe("Refreshed your homepage");
    expect(groups[0].items[1].label).toBe("Updated your FAQ");
  });
});

describe("selectStrelvaWork — never claims the owner's own edits as Strelva's", () => {
  it("includes AI + admin done-for-you work + posted review replies, excludes owner manual edits", () => {
    const entries = [
      { type: "ai", section: "hero", actor: "ai", time: "2026-07-05T10:00:00Z", text: "" },
      { type: "content", actor: "admin", time: "2026-07-05T09:30:00Z", text: 'published Products entry "Tart Apple Snaps"' },
      { type: "review-reply", actor: "user", time: "2026-07-05T09:00:00Z", text: "Replied to a 5-star review" },
      { type: "content", section: "services", actor: "user", time: "2026-07-05T08:00:00Z", text: "updated services" },
    ] as unknown as Parameters<typeof selectStrelvaWork>[0];
    const kept = selectStrelvaWork(entries);
    // AI update, admin done-for-you publish, and the posted review reply all count
    expect(kept.map((e) => e.actor)).toEqual(["ai", "admin", "user"]);
    // the owner's OWN manual (non-review-reply) actor:"user" edit is dropped
    expect(kept.some((e) => e.section === "services" && e.actor === "user")).toBe(false);
  });
});
