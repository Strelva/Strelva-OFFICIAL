import { DM_Sans } from "next/font/google";

/**
 * DM Sans for outcome components only (docs/design/outcome-components.md).
 * Scoped through `--font-outcome` on each component root; the app's interface
 * font (Geist, `--font-body`) is unchanged.
 */
export const outcomeFont = DM_Sans({
  variable: "--font-outcome",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});
