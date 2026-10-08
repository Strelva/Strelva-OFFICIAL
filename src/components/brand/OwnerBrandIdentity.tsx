import { BRAND_CREDIT, brandColors, type OwnerBrand } from "@/platform/infra/agency-brand";
export function OwnerBrandIdentity({ brand, rail = false }: { brand: OwnerBrand; rail?: boolean }) {
  const colors = brandColors(brand.accentColor);
  return <div data-agency-brand={brand.agencyId} style={{ background: rail ? "transparent" : colors.accent, color: rail ? "inherit" : colors.onAccent, borderLeft: rail ? `4px solid ${colors.accent}` : undefined, padding: "12px 16px", borderRadius: 12 }}>
    {!rail && brand.logoUrl ? <img src={brand.logoUrl} alt="" width={132} style={{ maxHeight: 64, maxWidth: "100%", objectFit: "contain", background: "#ffffff", borderRadius: 8, padding: 4 }} /> : null}
    {!rail ? <strong style={{ display: "block", overflowWrap: "anywhere" }}>{brand.name}</strong> : null}
    <small>{BRAND_CREDIT}</small>{brand.replyTo ? <a href={`mailto:${brand.replyTo}`} style={{ display: "block", color: "inherit", textDecoration: "underline", minHeight: 24 }}>{rail ? "Contact your agency" : `Contact ${brand.name}`}</a> : null}
  </div>;
}
