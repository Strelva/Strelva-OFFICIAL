import { getRedis } from "./redis";
import { getContent, setContent, recordSectionUpdate, appendVersion } from "./storage";
import { diffFields } from "./utils";
import type { TestimonialItem, TestimonialsContent } from "./types";

const TESTIMONIAL_CAP = 200;

function newTestimonialId(): string {
  return `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Atomically append a testimonial to the `testimonials` section.
 *
 * The read-modify-write runs server-side under a short per-tenant lock, so two
 * concurrent "use as testimonial" saves (or a save racing a manual edit) can't
 * drop one another. The old path did a client-side GET-then-PUT of the WHOLE
 * section, so two near-simultaneous appends each sent a full array built from a
 * stale read and last-write-won — a classic lost update. Here the client sends
 * only the new item and the server owns the merge.
 */
export async function appendTestimonial(
  tenant: string,
  input: { quote: string; author: string; location: string },
  actor: "user" | "admin" = "user",
): Promise<
  | { ok: true; testimonial: TestimonialItem; content: TestimonialsContent }
  | { ok: false; reason: "busy" }
> {
  const redis = getRedis();
  const lockKey = `content-lock:${tenant}:testimonials`;
  let locked = false;
  if (redis) {
    for (let i = 0; i < 25; i++) {
      const got = await redis.set(lockKey, "1", { nx: true, ex: 10 });
      if (got === "OK") {
        locked = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!locked) return { ok: false, reason: "busy" };
  }
  try {
    const current = (await getContent("testimonials", tenant)) as Partial<TestimonialsContent> | null;
    const existing = Array.isArray(current?.testimonials) ? current!.testimonials : [];
    const base: TestimonialsContent = {
      sectionLabel: current?.sectionLabel ?? "Testimonials",
      headline: current?.headline ?? "What clients say",
      testimonials: existing,
    };
    const testimonial: TestimonialItem = {
      id: newTestimonialId(),
      quote: input.quote.trim(),
      author: input.author.trim(),
      location: input.location.trim(),
    };
    // Idempotent on an exact double-submit (same quote+author) so a retry after
    // a flaky response doesn't create a duplicate.
    const dup = existing.find((t) => t.quote === testimonial.quote && t.author === testimonial.author);
    if (dup) return { ok: true, testimonial: dup, content: base };

    const content: TestimonialsContent = {
      ...base,
      testimonials: [...existing, testimonial].slice(-TESTIMONIAL_CAP),
    };
    await setContent("testimonials", content, tenant);
    await appendVersion(
      "testimonials",
      content,
      actor,
      tenant,
      // Double cast via unknown is required — TestimonialsContent isn't
      // structurally assignable to Record<string, unknown> (typed array field).
      diffFields(base as unknown as Record<string, unknown>, content as unknown as Record<string, unknown>),
    );
    await recordSectionUpdate("testimonials", tenant);
    return { ok: true, testimonial, content };
  } finally {
    if (locked && redis) await redis.del(lockKey).catch(() => {});
  }
}
