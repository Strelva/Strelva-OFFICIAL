import { BRAND_CREDIT, brandColors, type OwnerBrand } from "@/platform/infra/agency-brand";
export function OwnerBrandIdentity({ brand }: { brand: OwnerBrand }) {
  const colors = brandColors(brand.accentColor);
  return <div data-agency-brand={brand.agencyId} style={{ background: colors.accent, color: colors.onAccent, padding: "12px 16px", borderRadius: 12 }}>
    {brand.logoUrl ? <img src={brand.logoUrl} alt="" width={132} style={{ maxHeight: 64, maxWidth: "100%", objectFit: "contain", background: "#ffffff", borderRadius: 8, padding: 4 }} /> : null}
    <strong style={{ display: "block", overflowWrap: "anywhere" }}>{brand.name}</strong>
    <small>{BRAND_CREDIT}</small>{brand.replyTo ? <a href={`mailto:${brand.replyTo}`} style={{ display: "block", color: "inherit", textDecoration: "underline", minHeight: 24 }}>Contact {brand.name}</a> : null}
  </div>;
}
