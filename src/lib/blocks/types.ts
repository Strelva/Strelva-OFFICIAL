import type { z } from "zod";

/**
 * The block system, layered on the existing `PageSectionConfig` model. A "block"
 * is a `PageSectionConfig` whose `type` is registered here and whose `props`
 * match the block's Zod schema — self-contained (data lives in props), so it
 * renders generically without a per-template content store. One definition is
 * the single source of truth for three consumers: the editor (fields), the AI
 * (schema + defaults), and the renderer (the component, mapped separately).
 */

export type BlockFieldType =
  | "text"
  | "textarea"
  | "image"
  | "url"
  | "select"
  | "boolean"
  | "number";

export interface BlockFieldSpec {
  /** Key in the block's props. */
  key: string;
  label: string;
  type: BlockFieldType;
  /** For `select`. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
}

export type BlockCategory = "text" | "media" | "layout" | "action";

export interface BlockDefinition {
  /** Stable type id, also the `PageSectionConfig.type`. */
  type: string;
  label: string;
  /** lucide-react icon name (resolved in the editor palette). */
  icon: string;
  category: BlockCategory;
  /** Validates (and coerces, via `.default()`s) the block's props. */
  schema: z.ZodType<Record<string, unknown>>;
  /** Props for a freshly-added block. */
  defaults: Record<string, unknown>;
  /** Flat field list the editor renders to configure the block. */
  fields: BlockFieldSpec[];
}
