import type { CSSProperties, ReactNode } from "react";
import { brandColors, type OwnerBrand } from "@/platform/infra/agency-brand";
import styles from "./money.module.css";

/**
 * A page the paying public sees (XA · E4): the charging business's name, what
 * the money is for on the left, and one white panel with the amount and the
 * one pay button. Pebble stays out: end customers see the business, with a
 * quiet "Runs on Strelva" credit. The charging business's recorded accent
 * fills the one pay button (its label in white or black, whichever reads).
 */
function accentStyle(brand: OwnerBrand | string): CSSProperties | undefined {
  if (typeof brand === "string" || !/^#[0-9a-f]{6}$/i.test(brand.accentColor)) return undefined;
  const colors = brandColors(brand.accentColor);
  return { "--st-action": colors.accent, "--st-action-hover": colors.accent, "--st-on-action": colors.onAccent, "--st-accent": colors.onWhite } as CSSProperties;
}
export function PublicMoneyPage({
  brand,
  lead,
  panel,
  single = false,
}: {
  brand: OwnerBrand | string;
  lead: ReactNode;
  panel?: ReactNode;
  single?: boolean;
}) {
  const name = typeof brand === "string" ? brand : brand.name;
  const logo = typeof brand === "string" ? null : brand.logoUrl;
  return (
    <main className={styles.public} data-workspace-theme="linen" style={accentStyle(brand)}>
      <header className={styles.publicHeader}>
        <span className={styles.publicBrand}>
          {logo ? <img src={logo} alt="" /> : null}
          {name}
        </span>
      </header>
      <div
        className={styles.publicMain}
        data-single={single || !panel || undefined}
      >
        <div className={styles.publicLead}>{lead}</div>
        {panel ? (
          <section className={styles.panel} aria-label="Payment">
            {panel}
            <p className={styles.panelFoot}>Runs on Strelva</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
