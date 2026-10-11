import { z } from "zod";

export const BRAND_CREDIT = "Runs on Strelva.";
/** Normalize before validation so invisible characters cannot split a reserved word. */
export function normalizeAgencyName(name: string): string {
  return name.normalize("NFKC").replace(/[\u202a-\u202e\u2066-\u2069\u200e\u200f\u200b-\u200d\ufeff\u2060\u180e]/g, "").trim();
}
const reservedName = /(^|[^\p{L}\p{N}_])(strelva|google|microsoft|apple|meta|facebook|instagram|yelp|stripe|paypal|square|amazon)(?=$|[^\p{L}\p{N}_])/iu;
const addressOrUrl = /@|[a-z][a-z0-9+.-]*:\/\/|www\.|[\p{L}\p{N}-]+\.[a-z]{2,}(?:[\s/?:#]|$)/iu;
export const agencyNameSchema = z.string().transform(normalizeAgencyName).pipe(
  z.string().min(1).max(120).regex(/^[^\r\n\x00-\x1f\x7f]+$/)
    .refine(name => !reservedName.test(name) && !addressOrUrl.test(name), "Use your agency name, without platform names, addresses or URLs."),
);
export const brandInputSchema = z.object({
  displayName: agencyNameSchema,
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(v => v.toLowerCase()),
  replyTo: z.string().trim().email().max(254).nullable(),
  logo: z.object({ type: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(349528) }).strict().nullable(),
  // R23 is pending. The credit is configurable by schema, never removable today.
  credit: z.literal("runs_on_strelva").default("runs_on_strelva"),
}).strict();
export type AgencyBrandInput = z.infer<typeof brandInputSchema>;
export interface OwnerBrand {
  agencyId: string | null; name: string; logoUrl: string | null;
  accentColor: string; replyTo: string | null; credit: "runs_on_strelva";
}
export const STRELVA_BRAND: OwnerBrand = { agencyId: null, name: "Strelva", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" };

function luminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Invalid brand color");
  const c = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
}
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
/** A fill may be any color. Labels on white use dark ink if the accent is too light. */
export function brandColors(accent: string) {
  return { accent, onAccent: contrastRatio(accent, "#ffffff") >= 4.5 ? "#ffffff" : "#000000", onWhite: contrastRatio(accent, "#ffffff") >= 4.5 ? accent : "#14181c" };
}
