import { z } from "zod";
import type { BlockDefinition, BlockFieldSpec } from "./types";

// Shared field bits ---------------------------------------------------------
const ALIGN = ["left", "center", "right"] as const;
const alignField: BlockFieldSpec = {
  key: "align",
  label: "Alignment",
  type: "select",
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
  ],
};
const alignSchema = z.enum(ALIGN).default("left");

/**
 * Block type ids are namespaced (`block:heading`) so they never collide with a
 * template section type (`hero`, `services`, …) — same idea as Gutenberg's
 * `core/heading`. Authored below with short keys; the namespace is applied once
 * when the registry is built.
 */
export const BLOCK_PREFIX = "block:";

/**
 * The core block set — deliberately simple, flat props (no nested arrays) so the
 * editor stays a clean field form and the AI can edit any block reliably. Each
 * schema uses `.default()` everywhere so validation never throws on partial props.
 */
const RAW_DEFINITIONS: Record<string, BlockDefinition> = {
  heading: {
    type: "heading",
    label: "Heading",
    icon: "Heading",
    category: "text",
    defaults: { text: "Your heading", level: 2, align: "left" },
    schema: z.object({
      text: z.string().default("Your heading"),
      level: z.coerce.number().int().min(1).max(6).default(2),
      align: alignSchema,
    }),
    fields: [
      { key: "text", label: "Text", type: "text", placeholder: "Heading text" },
      {
        key: "level",
        label: "Size",
        type: "select",
        options: [
          { value: "1", label: "Largest (H1)" },
          { value: "2", label: "Large (H2)" },
          { value: "3", label: "Medium (H3)" },
          { value: "4", label: "Small (H4)" },
        ],
      },
      alignField,
    ],
  },

  text: {
    type: "text",
    label: "Text",
    icon: "Type",
    category: "text",
    defaults: { text: "Add your text here.", align: "left" },
    schema: z.object({
      text: z.string().default(""),
      align: alignSchema,
    }),
    fields: [
      { key: "text", label: "Text", type: "textarea", placeholder: "Write something…" },
      alignField,
    ],
  },

  image: {
    type: "image",
    label: "Image",
    icon: "Image",
    category: "media",
    defaults: { src: "", alt: "", rounded: false },
    schema: z.object({
      src: z.string().default(""),
      alt: z.string().default(""),
      rounded: z.coerce.boolean().default(false),
    }),
    fields: [
      { key: "src", label: "Image", type: "image" },
      { key: "alt", label: "Alt text", type: "text", help: "Describes the image for search + screen readers." },
      { key: "rounded", label: "Rounded corners", type: "boolean" },
    ],
  },

  button: {
    type: "button",
    label: "Button",
    icon: "MousePointerClick",
    category: "action",
    defaults: { label: "Get started", href: "#", style: "primary", align: "left" },
    schema: z.object({
      label: z.string().default("Get started"),
      href: z.string().default("#"),
      style: z.enum(["primary", "secondary"]).default("primary"),
      align: alignSchema,
    }),
    fields: [
      { key: "label", label: "Button text", type: "text" },
      { key: "href", label: "Link", type: "url", placeholder: "https://… or /page" },
      {
        key: "style",
        label: "Style",
        type: "select",
        options: [
          { value: "primary", label: "Primary (filled)" },
          { value: "secondary", label: "Secondary (outline)" },
        ],
      },
      alignField,
    ],
  },

  hero: {
    type: "hero",
    label: "Hero",
    icon: "LayoutTemplate",
    category: "layout",
    defaults: {
      heading: "A headline that sells",
      subheading: "One clear sentence about what you do and who it's for.",
      ctaLabel: "Book now",
      ctaHref: "#",
      imageSrc: "",
      align: "center",
    },
    schema: z.object({
      heading: z.string().default(""),
      subheading: z.string().default(""),
      ctaLabel: z.string().default(""),
      ctaHref: z.string().default("#"),
      imageSrc: z.string().default(""),
      align: alignSchema,
    }),
    fields: [
      { key: "heading", label: "Headline", type: "text" },
      { key: "subheading", label: "Subhead", type: "textarea" },
      { key: "ctaLabel", label: "Button text", type: "text" },
      { key: "ctaHref", label: "Button link", type: "url" },
      { key: "imageSrc", label: "Background image", type: "image" },
      alignField,
    ],
  },

  cta: {
    type: "cta",
    label: "Call to action",
    icon: "Megaphone",
    category: "action",
    defaults: {
      heading: "Ready when you are",
      text: "Tell visitors exactly what to do next.",
      buttonLabel: "Get in touch",
      buttonHref: "#",
      tone: "accent",
    },
    schema: z.object({
      heading: z.string().default(""),
      text: z.string().default(""),
      buttonLabel: z.string().default(""),
      buttonHref: z.string().default("#"),
      tone: z.enum(["accent", "dark", "light"]).default("accent"),
    }),
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "text", label: "Text", type: "textarea" },
      { key: "buttonLabel", label: "Button text", type: "text" },
      { key: "buttonHref", label: "Button link", type: "url" },
      {
        key: "tone",
        label: "Background",
        type: "select",
        options: [
          { value: "accent", label: "Accent" },
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ],
      },
    ],
  },

  columns: {
    type: "columns",
    label: "Columns",
    icon: "Columns3",
    category: "layout",
    defaults: {
      count: 3,
      col1Title: "First", col1Text: "Say something useful.",
      col2Title: "Second", col2Text: "Say something useful.",
      col3Title: "Third", col3Text: "Say something useful.",
    },
    schema: z.object({
      count: z.coerce.number().int().min(2).max(3).default(3),
      col1Title: z.string().default(""), col1Text: z.string().default(""),
      col2Title: z.string().default(""), col2Text: z.string().default(""),
      col3Title: z.string().default(""), col3Text: z.string().default(""),
    }),
    fields: [
      { key: "count", label: "Number of columns", type: "select", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }] },
      { key: "col1Title", label: "Column 1 title", type: "text" },
      { key: "col1Text", label: "Column 1 text", type: "textarea" },
      { key: "col2Title", label: "Column 2 title", type: "text" },
      { key: "col2Text", label: "Column 2 text", type: "textarea" },
      { key: "col3Title", label: "Column 3 title", type: "text" },
      { key: "col3Text", label: "Column 3 text", type: "textarea" },
    ],
  },

  divider: {
    type: "divider",
    label: "Divider",
    icon: "Minus",
    category: "layout",
    defaults: { spacing: "normal" },
    schema: z.object({ spacing: z.enum(["tight", "normal", "loose"]).default("normal") }),
    fields: [
      {
        key: "spacing",
        label: "Spacing",
        type: "select",
        options: [
          { value: "tight", label: "Tight" },
          { value: "normal", label: "Normal" },
          { value: "loose", label: "Loose" },
        ],
      },
    ],
  },

  spacer: {
    type: "spacer",
    label: "Spacer",
    icon: "MoveVertical",
    category: "layout",
    defaults: { size: "medium" },
    schema: z.object({ size: z.enum(["small", "medium", "large"]).default("medium") }),
    fields: [
      {
        key: "size",
        label: "Height",
        type: "select",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
      },
    ],
  },

  video: {
    type: "video",
    label: "Video",
    icon: "Video",
    category: "media",
    defaults: { url: "", caption: "" },
    schema: z.object({ url: z.string().default(""), caption: z.string().default("") }),
    fields: [
      { key: "url", label: "Video URL", type: "url", placeholder: "YouTube or Vimeo link", help: "Paste a YouTube or Vimeo link — we embed it." },
      { key: "caption", label: "Caption", type: "text" },
    ],
  },

  quote: {
    type: "quote",
    label: "Quote",
    icon: "Quote",
    category: "text",
    defaults: { text: "Working with them was the best decision we made.", author: "Happy customer", role: "" },
    schema: z.object({ text: z.string().default(""), author: z.string().default(""), role: z.string().default("") }),
    fields: [
      { key: "text", label: "Quote", type: "textarea" },
      { key: "author", label: "Author", type: "text" },
      { key: "role", label: "Role / company", type: "text" },
    ],
  },

  gallery: {
    type: "gallery",
    label: "Gallery",
    icon: "Images",
    category: "media",
    defaults: { img1: "", img2: "", img3: "", img4: "" },
    schema: z.object({
      img1: z.string().default(""), img2: z.string().default(""),
      img3: z.string().default(""), img4: z.string().default(""),
    }),
    fields: [
      { key: "img1", label: "Image 1", type: "image" },
      { key: "img2", label: "Image 2", type: "image" },
      { key: "img3", label: "Image 3", type: "image" },
      { key: "img4", label: "Image 4", type: "image" },
    ],
  },

  stats: {
    type: "stats",
    label: "Stats",
    icon: "BarChart3",
    category: "layout",
    defaults: {
      stat1Value: "500+", stat1Label: "Happy clients",
      stat2Value: "4.9", stat2Label: "Average rating",
      stat3Value: "10 yrs", stat3Label: "In business",
    },
    schema: z.object({
      stat1Value: z.string().default(""), stat1Label: z.string().default(""),
      stat2Value: z.string().default(""), stat2Label: z.string().default(""),
      stat3Value: z.string().default(""), stat3Label: z.string().default(""),
    }),
    fields: [
      { key: "stat1Value", label: "Stat 1 value", type: "text" },
      { key: "stat1Label", label: "Stat 1 label", type: "text" },
      { key: "stat2Value", label: "Stat 2 value", type: "text" },
      { key: "stat2Label", label: "Stat 2 label", type: "text" },
      { key: "stat3Value", label: "Stat 3 value", type: "text" },
      { key: "stat3Label", label: "Stat 3 label", type: "text" },
    ],
  },

  faq: {
    type: "faq",
    label: "FAQ",
    icon: "CircleHelp",
    category: "text",
    defaults: { q1: "How does it work?", a1: "Tell us, and we handle it.", q2: "Can I cancel anytime?", a2: "Yes — no contracts.", q3: "", a3: "" },
    schema: z.object({
      q1: z.string().default(""), a1: z.string().default(""),
      q2: z.string().default(""), a2: z.string().default(""),
      q3: z.string().default(""), a3: z.string().default(""),
    }),
    fields: [
      { key: "q1", label: "Question 1", type: "text" },
      { key: "a1", label: "Answer 1", type: "textarea" },
      { key: "q2", label: "Question 2", type: "text" },
      { key: "a2", label: "Answer 2", type: "textarea" },
      { key: "q3", label: "Question 3", type: "text" },
      { key: "a3", label: "Answer 3", type: "textarea" },
    ],
  },

  logos: {
    type: "logos",
    label: "Logo row",
    icon: "Building2",
    category: "media",
    defaults: { heading: "Trusted by local businesses", logo1: "", logo2: "", logo3: "", logo4: "" },
    schema: z.object({
      heading: z.string().default(""),
      logo1: z.string().default(""), logo2: z.string().default(""),
      logo3: z.string().default(""), logo4: z.string().default(""),
    }),
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "logo1", label: "Logo 1", type: "image" },
      { key: "logo2", label: "Logo 2", type: "image" },
      { key: "logo3", label: "Logo 3", type: "image" },
      { key: "logo4", label: "Logo 4", type: "image" },
    ],
  },
};

/** The registry, keyed by namespaced type (`block:heading`). */
export const BLOCK_DEFINITIONS: Record<string, BlockDefinition> = Object.fromEntries(
  Object.entries(RAW_DEFINITIONS).map(([key, def]) => {
    const type = `${BLOCK_PREFIX}${key}`;
    return [type, { ...def, type }];
  }),
);

export const BLOCK_TYPES = Object.keys(BLOCK_DEFINITIONS);

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_DEFINITIONS[type];
}

export function isBlockType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(BLOCK_DEFINITIONS, type);
}

export function blockDefaults(type: string): Record<string, unknown> {
  return { ...(getBlockDefinition(type)?.defaults ?? {}) };
}

/** Validate + coerce a block's props; falls back to the block's defaults so a
 *  malformed prop bag never throws or renders broken. */
export function validateBlockProps(type: string, props: unknown): Record<string, unknown> {
  const def = getBlockDefinition(type);
  if (!def) return {};
  const parsed = def.schema.safeParse(props ?? {});
  return parsed.success ? parsed.data : { ...def.defaults };
}
