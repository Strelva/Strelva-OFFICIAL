import type { SitePlatform } from "./contracts";

/**
 * Keep your site: where to paste the two connection lines, per platform.
 * One table, so the steps live as data rather than as copy scattered across
 * screens. The owner reads them, or copies them for whoever runs the site;
 * nothing is sent from here.
 *
 * Steps follow each vendor's own help pages, checked October 12, 2026 (see
 * `source`). Webflow and Duda help pages refused automated reads that day;
 * their steps rest on vendor developer docs and secondary guides. Menus move;
 * when a vendor renames one, change it here only.
 */
export interface InstallGuide {
  platform: SitePlatform;
  label: string;
  /** Where the lines go, in the vendor's own menu words. */
  steps: string[];
  /** Plan or access the platform needs before custom code works, when it limits who can do this. */
  requires?: string;
  /** False when the platform can't run the lines at all. */
  supported: boolean;
  /** The vendor help page the steps follow. */
  source?: string;
}

const PUBLISH_AND_CHECK = "Come back here and choose Check my site.";

export const INSTALL_GUIDES: Record<SitePlatform, InstallGuide> = {
  wordpress: {
    platform: "wordpress", label: "WordPress", supported: true,
    steps: [
      "In your WordPress admin, go to Plugins → Add New Plugin and install WPCode (Insert Headers and Footers). Activate it.",
      "Go to Code Snippets → Header & Footer.",
      "Paste both lines into the Header box and choose Save Changes.",
      PUBLISH_AND_CHECK,
    ],
    requires: "On WordPress.com, adding code needs a paid plan; check that yours allows plugins.",
    source: "https://wordpress.org/plugins/insert-headers-and-footers/",
  },
  wix: {
    platform: "wix", label: "Wix", supported: true,
    steps: [
      "In your Wix dashboard, go to Settings → Development & integrations → Custom Code.",
      "Choose + Add Custom Code and paste both lines.",
      "Name it Strelva. Under Add Code to Pages choose All pages and Load code once. Under Place Code in choose Head.",
      "Choose Apply.",
      PUBLISH_AND_CHECK,
    ],
    requires: "Wix runs custom code only on a published site with a connected domain, usually a premium plan. Changing the domain removes the code.",
    source: "https://support.wix.com/en/article/embedding-custom-code-on-your-site",
  },
  squarespace: {
    platform: "squarespace", label: "Squarespace", supported: true,
    steps: [
      "In Squarespace, open the Code Injection panel (press / in the editor and search for Code Injection).",
      "Paste both lines into the Header box.",
      "Choose Save.",
      PUBLISH_AND_CHECK,
    ],
    requires: "Code Injection is only on Squarespace plans that include it (Core, Plus or Advanced; not Basic).",
    source: "https://support.squarespace.com/hc/en-us/articles/205815908-Using-code-injection",
  },
  webflow: {
    platform: "webflow", label: "Webflow", supported: true,
    steps: [
      "In Webflow, open Site settings → Custom code.",
      "Paste both lines into Head code and choose Save changes.",
      "Publish the site.",
      PUBLISH_AND_CHECK,
    ],
    requires: "Webflow runs site-wide custom code on a paid site plan.",
  },
  shopify: {
    platform: "shopify", label: "Shopify", supported: true,
    steps: [
      "In Shopify admin, go to Online Store → Themes.",
      "Next to your live theme, open the … menu and choose Edit code. Duplicate the theme first if you want a copy to go back to.",
      "Open layout/theme.liquid and paste both lines just above </head>.",
      "Choose Save.",
      PUBLISH_AND_CHECK,
    ],
    source: "https://help.shopify.com/en/manual/online-store/themes/theme-structure/extend/edit-theme-code",
  },
  godaddy: {
    platform: "godaddy", label: "GoDaddy", supported: false,
    steps: [
      "GoDaddy Websites + Marketing has no documented place for site-wide header code. Its HTML sections run code inside a box on one page, so these lines won't work there.",
      "Your site still works as it is. To connect it, ask GoDaddy support whether your plan allows header code, or prepare a new website instead.",
    ],
    source: "https://www.godaddy.com/help/add-html-or-custom-code-to-my-site-27252",
  },
  duda: {
    platform: "duda", label: "Duda", supported: true,
    steps: [
      "In the Duda editor, open Settings → Head HTML and paste the <meta> line. Save.",
      "Open Settings → Body-end HTML and paste the <script> line. Save. Duda asks for scripts there, not in the head.",
      "Republish the site.",
      PUBLISH_AND_CHECK,
    ],
    requires: "Duda sites are usually run by an agency or web person. If you can't see Settings, send them these steps.",
    source: "https://developer.duda.co/reference/app-site-wide-html-object",
  },
  custom: {
    platform: "custom", label: "Custom or hand-written", supported: true,
    steps: [
      "Paste both lines inside the <head> of every page, or once in the shared layout every page uses.",
      "Deploy the site the way you usually do.",
      PUBLISH_AND_CHECK,
    ],
  },
  unknown: {
    platform: "unknown", label: "I'm not sure", supported: true,
    steps: [
      "Look for Custom code, Code injection, Site-wide code or Head HTML in your site's settings. Most builders have one of these.",
      "Paste both lines there so they load on every page, then save and publish.",
      "Can't find it? Send these steps to whoever built or runs your site.",
      PUBLISH_AND_CHECK,
    ],
  },
  framer: {
    platform: "framer", label: "Framer", supported: true,
    steps: [
      "In Framer, open Site Settings → Custom Code and choose Add Script.",
      "Name it Strelva, paste both lines, place it at the end of <head>, leave pages empty for all pages, and save.",
      "Publish the site.",
      PUBLISH_AND_CHECK,
    ],
    requires: "Framer runs custom code only on a paid site plan.",
    source: "https://www.framer.com/help/articles/how-to-add-custom-code/",
  },
  carrd: {
    platform: "carrd", label: "Carrd", supported: true,
    steps: [
      "In Carrd, add an Embed element.",
      "Set Type to Code, Style to Hidden and Location to Head.",
      "Paste both lines into Code and publish.",
      PUBLISH_AND_CHECK,
    ],
    requires: "Carrd embeds need Pro Standard or higher.",
    source: "https://carrd.com/docs/building/embedding-custom-code",
  },
  square: {
    platform: "square", label: "Square", supported: true,
    steps: [
      "In your Square Dashboard, go to Square Online → Settings → Tracking Tools and choose Add new code.",
      "Name it Strelva, paste both lines, set placement to head, and save.",
      "Publish the site.",
      PUBLISH_AND_CHECK,
    ],
    requires: "The account owner, or a team member with online permissions, adds tracking code.",
    source: "https://squareup.com/help/us/en/article/6957-add-custom-tracking-code-to-your-website",
  },
  "google-sites": {
    platform: "google-sites", label: "Google Sites", supported: false,
    steps: [
      "Google Sites can't add code to a page's head, so these lines won't run there.",
      "Your site still works as it is. To connect it, move it to a builder that allows header code, or prepare a new website instead.",
    ],
  },
  lovable: { platform: "lovable", label: "Lovable", supported: true, steps: ["Ask Lovable to add both lines inside <head> in index.html, then publish.", PUBLISH_AND_CHECK] },
  v0: { platform: "v0", label: "v0", supported: true, steps: ["Ask v0 to add both lines inside <head> in the root layout, then deploy.", PUBLISH_AND_CHECK] },
  bolt: { platform: "bolt", label: "Bolt", supported: true, steps: ["Ask Bolt to add both lines inside <head> in index.html, then deploy.", PUBLISH_AND_CHECK] },
  chatgpt: { platform: "chatgpt", label: "ChatGPT", supported: true, steps: ["Paste both lines inside <head> of the page ChatGPT made, then publish it where it's hosted.", PUBLISH_AND_CHECK] },
  claude: { platform: "claude", label: "Claude", supported: true, steps: ["Paste both lines inside <head> of the page Claude made, then publish it where it's hosted.", PUBLISH_AND_CHECK] },
  strelva: { platform: "strelva", label: "Strelva", supported: true, steps: ["Sites Strelva hosts are already connected. Nothing to paste."] },
};

/** The platforms offered in "Built with", in the order owners recognize them. */
export const GUIDE_ORDER: SitePlatform[] = [
  "wordpress", "wix", "squarespace", "webflow", "shopify", "godaddy", "duda", "framer", "carrd", "square", "google-sites", "custom", "unknown",
];

export function installGuide(platform: SitePlatform): InstallGuide {
  return INSTALL_GUIDES[platform] ?? INSTALL_GUIDES.unknown;
}

/**
 * Plain text the owner copies for whoever runs the site: what this is, the
 * exact lines, and where they go. Strelva never sends it.
 */
export function installStepsText(input: { platform: SitePlatform; siteHost: string; lines: string }): string {
  const guide = installGuide(input.platform);
  return [
    `Please add two lines to ${input.siteHost} so it connects to Strelva.`,
    "They let the site show our confirmed business details and send its inquiries to us. They don't change the pages.",
    "",
    "The lines:",
    input.lines,
    "",
    `Where they go (${guide.label}):`,
    ...guide.steps.filter(step => step !== PUBLISH_AND_CHECK).map((step, index) => `${index + 1}. ${step}`),
    ...(guide.requires ? ["", `Note: ${guide.requires}`] : []),
    "",
    "Reply when they're live and we'll check the site.",
  ].join("\n");
}
