import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { ContentSection } from "@/lib/types";
import { getContent, setContent, recordSectionUpdate } from "@/lib/storage";

const VALID_SECTIONS: ContentSection[] = [
  "hero",
  "services",
  "story",
  "testimonials",
  "events",
  "providers",
  "contact",
  "settings",
];

function isValidSection(section: string): section is ContentSection {
  return VALID_SECTIONS.includes(section as ContentSection);
}

const REQUIRED_FIELDS: Record<ContentSection, string[]> = {
  hero: ["headline", "tagline", "ctaText"],
  services: ["headline"],
  story: ["headline", "statement"],
  testimonials: [],
  events: [],
  providers: [],
  contact: ["email"],
  settings: ["siteName"],
};

function validateBody(section: ContentSection, body: Record<string, unknown>): string | null {
  const required = REQUIRED_FIELDS[section];
  for (const field of required) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      return `"${field}" is required and cannot be empty`;
    }
  }

  if (section === "contact" && typeof body.email === "string") {
    if (!body.email.includes("@") || !body.email.includes(".")) {
      return "Invalid email address";
    }
  }

  if (section === "services" && Array.isArray(body.services)) {
    for (let i = 0; i < body.services.length; i++) {
      const s = body.services[i] as Record<string, unknown>;
      if (typeof s.name !== "string" || s.name.trim() === "") {
        return `Service ${i + 1} is missing a name`;
      }
    }
  }

  if (section === "testimonials" && Array.isArray(body.testimonials)) {
    for (let i = 0; i < body.testimonials.length; i++) {
      const t = body.testimonials[i] as Record<string, unknown>;
      if (typeof t.quote !== "string" || t.quote.trim() === "") {
        return `Testimonial ${i + 1} is missing a quote`;
      }
    }
  }

  if (section === "events" && Array.isArray(body.events)) {
    for (let i = 0; i < body.events.length; i++) {
      const e = body.events[i] as Record<string, unknown>;
      if (typeof e.title !== "string" || e.title.trim() === "") {
        return `Event ${i + 1} is missing a title`;
      }
    }
  }

  if (section === "providers" && Array.isArray(body.providers)) {
    for (let i = 0; i < body.providers.length; i++) {
      const p = body.providers[i] as Record<string, unknown>;
      if (typeof p.name !== "string" || p.name.trim() === "") {
        return `Provider ${i + 1} is missing a name`;
      }
    }
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  if (!isValidSection(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const data = await getContent(section);
  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  if (!isValidSection(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const body = await request.json();

  const validationError = validateBody(section, body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  await setContent(section, body);
  await recordSectionUpdate(section);
  revalidatePath("/");

  return NextResponse.json({ success: true });
}
