# OWSH Schema & Sitemap Snapshot - Chrome Extension

A lightweight browser extension that analyzes any webpage for schema markup and sitemap presence. Validates JSON-LD and Microdata against Google's rich results requirements.

**Version:** 1.0.0 | **Manifest:** V3 | **Store Name:** Schema & Sitemap Checker - OWSH Snapshot

## Features

### Schema Tab

- **Schema status** indicator (Found / Not Found) with count of detected types
- **JSON-LD detection** — parses all `<script type="application/ld+json">` blocks, including `@graph` structures
- **Microdata detection** — finds elements with `itemtype` attributes and extracts `itemprop` properties
- **Rich results eligibility validation** for 14 Google schema types:

| Schema Type | Rich Result | Required Fields |
|-------------|-------------|-----------------|
| LocalBusiness | Local Business | name, address |
| Organization | Organization | name, url |
| Product | Product Snippets | name |
| Article | Article | headline, image, datePublished, author |
| BlogPosting | Article | headline, image, datePublished, author |
| FAQPage | FAQ | mainEntity |
| HowTo | How-to | name, step |
| Recipe | Recipe | name, image |
| Event | Event | name, startDate, location |
| JobPosting | Job Posting | title, description, datePosted, hiringOrganization, jobLocation |
| Course | Course | name, description, provider |
| BreadcrumbList | Breadcrumb | itemListElement |
| WebSite | Sitelinks Search Box | name, url |
| VideoObject | Video | name, description, thumbnailUrl, uploadDate |

- **Per-type validation** showing:
  - Eligibility status: Eligible / Partial / Not Eligible
  - Score (0-100)
  - Required fields checklist with pass/fail indicators
  - Recommended fields checklist (collapsible)
  - Key properties (name, rating, reviews, address, etc.)
- **Raw JSON-LD display** with pretty-printed code blocks and copy-to-clipboard
- **@context and @type validation** — flags missing or invalid context/type
- **Issues list** with error and warning severity levels

### Sitemap Tab

- **Discovery checks** for three locations:
  - `/robots.txt` — parses for sitemap references, disallow rules, crawl-delay directives
  - `/sitemap.xml` — validates XML format, counts URLs, checks lastmod/changefreq/priority
  - `/sitemap_index.xml` — validates index format, counts child sitemaps
- **Status per check**: found / not found / blocked / invalid
- **Sitemap details** when found:
  - Type (Standard urlset vs Index sitemapindex)
  - URL or sitemap count
  - lastmod presence
  - Declared sitemap reference from robots.txt
- **robots.txt content** display with directive summary (disallow count, sitemap count)
- **Sample URLs** — first 10 URLs extracted from the sitemap

## Scoring Algorithm

Each schema type is scored on a 0-100 scale:

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Required fields | 70% | (fields present / total required) x 70 |
| Recommended fields | 30% | (fields present / total recommended) x 30 |

**Eligibility rules:**
- **Eligible**: All required fields present
- **Partial**: 50%+ required fields present
- **Not Eligible**: Less than 50% of required fields present

## Error Handling

The extension handles edge cases gracefully:
- **Restricted URLs** (chrome://, extension://, file://, etc.) show a clear "Cannot analyze this page type" message
- **JSON parse errors** are reported with schema block number and "Invalid JSON-LD syntax" detail
- **Network errors** during sitemap fetching show status with explanation
- **Invalid XML** is detected and reported before parsing

## Data Limits

- Raw schema JSON is truncated to 5,000 characters per block
- robots.txt content is truncated to 1,500 characters
- Sitemap sample URLs capped at 10
- Schema name property truncated to 50 characters in the summary view

## Installation

### Development/Testing
1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `schema-extension` folder

### Production
Install from the Chrome Web Store (link coming soon)

## Usage
1. Navigate to any website
2. Click the extension icon in your toolbar
3. View schema and sitemap analysis
4. Click "Full Report" for detailed analysis at audit.owshsystems.com/schema-sitemap

## Project Structure

```
schema-extension/
├── manifest.json               # Extension manifest (v3)
├── src/
│   ├── popup/
│   │   ├── popup.html          # Popup UI (2 tabs)
│   │   ├── popup.css           # Popup styles
│   │   └── popup.js            # Popup logic & analysis engine
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
├── store-assets/               # Chrome Web Store assets
├── STORE_LISTING.md            # Store listing copy
└── README.md
```

## Permissions

- **activeTab**: Required to analyze the current webpage when clicked
- **scripting**: Required to extract schema markup and run same-origin sitemap checks

## Privacy

This extension:
- Does NOT collect personal data
- Does NOT track browsing history
- Does NOT send data to external servers (except when "Full Report" is clicked)
- All analysis is performed locally

## Links

- [Full Web App](https://audit.owshsystems.com/schema-sitemap)
- [OWSH Systems](https://owshsystems.com)
- [Privacy Policy](https://audit.owshsystems.com/privacy/schema-extension)

## Support

For issues or questions, contact: hello@owshsystems.com
