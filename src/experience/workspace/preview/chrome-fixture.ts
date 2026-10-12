import type { OwnerBrand } from "@/platform/infra/agency-brand";
/** Fictional identities shared by preview shells only. Never a live fallback. */
export const PREVIEW_NORTH_BRAND: OwnerBrand = { agencyId: "22222222-2222-4222-8222-222222222222", name: "North Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" };
export const PREVIEW_STRELVA_AGENCY_BRAND: OwnerBrand = { ...PREVIEW_NORTH_BRAND, agencyId: "33333333-3333-4333-8333-333333333333", name: "Strelva Agency" };
