import { isValidElement, type ReactNode } from "react";
import { z } from "zod";
import type { OwnerBrand } from "@/platform/infra/agency-brand";

const ownerBrandSchema = z.object({
  agencyId: z.string().min(1).nullable(),
  name: z.string().trim().min(1),
  logoUrl: z.string().url().regex(/^https?:\/\//).nullable(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  replyTo: z.string().email().nullable(),
  credit: z.literal("runs_on_strelva"),
});

/** A malformed or unavailable lookup never supplies a platform-branded fallback. */
export function readOwnerBrand(value: unknown): OwnerBrand | null {
  const parsed = ownerBrandSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Promote existing plain context labels into the shared header; keep switchers interactive. */
export function plainWorkspaceName(context: ReactNode): string | null {
  if (typeof context === "string") return context.trim() || null;
  if (isValidElement<{ children?: ReactNode }>(context) && typeof context.props.children === "string") return context.props.children.trim() || null;
  return null;
}
