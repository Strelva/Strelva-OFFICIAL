import { DM_Serif_Display, Fraunces, Instrument_Serif, Inter, Manrope, Playfair_Display, Work_Sans } from "next/font/google";
import type { VisitorFont, VisitorType } from "@/products/websites/client";

/*
 * The faces a business's site can record (VISITOR_FONTS, the theme picker's
 * curated list), self-hosted by next/font for the visitor pages only. None is
 * preloaded: a page downloads a face only when the business's type uses it.
 */
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap", preload: false });

const FAMILY: Record<VisitorFont, string> = {
  Fraunces: fraunces.style.fontFamily,
  Instrument_Serif: instrumentSerif.style.fontFamily,
  Playfair_Display: playfair.style.fontFamily,
  DM_Serif_Display: dmSerif.style.fontFamily,
  Inter: inter.style.fontFamily,
  DM_Sans: "var(--font-workspace), 'DM Sans'",
  Manrope: manrope.style.fontFamily,
  Work_Sans: workSans.style.fontFamily,
};
/** Single-weight display faces read too heavy when the browser fakes a bold. */
const SINGLE_WEIGHT: ReadonlySet<VisitorFont> = new Set(["Instrument_Serif", "DM_Serif_Display"]);

/** The --visitor-font / --visitor-display variables for a business's type. Empty when it uses the defaults. */
export function visitorTypeStyle(type: VisitorType | null | undefined): Record<string, string> {
  if (!type) return {};
  return {
    ...(type.body ? { "--visitor-font": `${FAMILY[type.body]}, system-ui, sans-serif` } : {}),
    ...(type.display ? { "--visitor-display": `${FAMILY[type.display]}, ${type.body ? FAMILY[type.body] : "var(--font-workspace)"}, serif` } : {}),
    ...(type.display && SINGLE_WEIGHT.has(type.display) ? { "--visitor-display-weight": "400" } : {}),
  };
}
