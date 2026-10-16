import type { CSSProperties, ReactNode } from "react";
import { brandColors, type OwnerBrand } from "@/platform/infra/agency-brand";
import styles from "./money.module.css";

/**
 * A page the paying public sees (XA · E4): the charging business's name, what
 * the money is for on the left, and one white panel with the amount and the
 * one pay button. Pebble stays out: end customers see the business, with a
 * quiet "Runs on Strelva" credit. The page wears the charging business's own
 * color on its one button and its links, never Strelva ink.
 */
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
  let wear: CSSProperties | undefined;
  if (typeof brand !== "string") {
    try {
      const colors = brandColors(brand.accentColor);
      wear = {
        "--st-action": colors.accent,
        "--st-action-hover": colors.accent,
        "--st-on-action": colors.onAccent,
        "--st-accent": colors.onWhite,
      } as CSSProperties;
    } catch {
      wear = undefined;
    }
  }
  return (
    <main
      className={styles.public}
      data-workspace-theme="linen"
      style={wear}
    >
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
