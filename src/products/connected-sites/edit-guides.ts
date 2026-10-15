import type { SitePlatform } from "./contracts";

/**
 * Keep your site: how an agency makes a change in each builder's own editor.
 * One table, so the steps live as data. Strelva never makes the edit and
 * cannot sign in to any of these.
 *
 * Written from each vendor's help pages in October 2026, not yet followed on a
 * live account. Menus move; change them here only.
 */
export interface EditGuide { platform: SitePlatform; label: string; open: string; publish: string; note?: string }

const OTHER = { open: "Open whatever you use to change {page} on the site.", publish: "Publish or deploy the site the usual way." };

export const EDIT_GUIDES: Record<SitePlatform, EditGuide> = {
  wordpress: { platform: "wordpress", label: "WordPress", open: "In your WordPress admin, open Pages (or Posts), find {page} and choose Edit. If it was built with Elementor or Divi, choose Edit with that builder instead.", publish: "Choose Update." },
  wix: { platform: "wix", label: "Wix", open: "Open your Wix dashboard, choose Edit Site, then open {page} from the Pages panel.", publish: "Choose Publish (top right)." },
  squarespace: { platform: "squarespace", label: "Squarespace", open: "In Squarespace, open Pages, choose {page}, then choose Edit.", publish: "Choose Save. Squarespace publishes when you save." },
  webflow: { platform: "webflow", label: "Webflow", open: "Open the site in the Webflow Designer (or the Editor for text-only changes) and open {page} from the Pages panel.", publish: "Choose Publish and publish to the live domain." },
  duda: { platform: "duda", label: "Duda", open: "Open the site in the Duda editor and choose {page} from Pages.", publish: "Choose Republish." },
  godaddy: { platform: "godaddy", label: "GoDaddy", open: "In GoDaddy, choose Edit Website, then open {page} from the page list.", publish: "Choose Publish." },
  shopify: { platform: "shopify", label: "Shopify", open: "In Shopify admin, open Online Store → Pages for page text, or Online Store → Themes → Customize for sections, and open {page}.", publish: "Choose Save." },
  framer: { platform: "framer", label: "Framer", open: "Open the project in Framer and select {page}.", publish: "Choose Publish." },
  square: { platform: "square", label: "Square", open: "In Square Online, choose Edit site and open {page}.", publish: "Choose Publish." },
  carrd: { platform: "carrd", label: "Carrd", open: "Open the site in Carrd.", publish: "Choose Publish changes." },
  "google-sites": { platform: "google-sites", label: "Google Sites", open: "Open the site in Google Sites and choose {page}.", publish: "Choose Publish." },
  custom: { platform: "custom", label: "your site builder", ...OTHER },
  unknown: { platform: "unknown", label: "your site builder", ...OTHER },
  lovable: { platform: "lovable", label: "Lovable", ...OTHER },
  v0: { platform: "v0", label: "v0", ...OTHER },
  bolt: { platform: "bolt", label: "Bolt", ...OTHER },
  chatgpt: { platform: "chatgpt", label: "ChatGPT", ...OTHER },
  claude: { platform: "claude", label: "Claude", ...OTHER },
  strelva: { platform: "strelva", label: "Strelva", ...OTHER },
};

export function editGuide(platform: SitePlatform): EditGuide {
  return EDIT_GUIDES[platform] ?? EDIT_GUIDES.unknown;
}

/** The four steps an agency follows: open the page, make the change, publish, mark it done here. */
export function editStepsFor(platform: SitePlatform, input: { pagePath: string; whatToChange: string }): string[] {
  const guide = editGuide(platform);
  const page = input.pagePath === "/" || input.pagePath === "" ? "the home page" : input.pagePath;
  return [
    guide.open.replaceAll("{page}", page),
    `Make this change: ${input.whatToChange}`,
    guide.publish.replaceAll("{page}", page),
    "Come back to Strelva and choose Mark done.",
  ];
}
