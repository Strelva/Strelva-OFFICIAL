# OWSH Page Audit Chrome Extension

A lightweight Chrome extension that provides quick on-page SEO analysis for any webpage. Analyzes titles, meta descriptions, headings, images, links, and keyword usage instantly.

**Version:** 1.1.0 | **Manifest:** V3 | **Store Name:** SEO & Content Checker - OWSH Page Audit

## Features

### Overview Tab
- **Page Health Score** (0-100) with verdict: Excellent / Good / Fair / Needs Work / Poor
- **Top Priority Fix** recommendation — surfaces the single most important issue to address
- **Title analysis** with character count and length assessment
- **Meta description analysis** with character count and length assessment
- **URL display** for the analyzed page
- **Quick Stats**: word count, image count, link count, language
- **Heading counts** grid (H1-H6 totals)
- **Canonical tag** detection (found/missing)
- **Visual Assets**: favicon detection with preview, Open Graph image detection with preview
- **Images analysis**: total images, alt text coverage percentage, thumbnails of images missing alt text

### Headings Tab
- **Heading level pills** showing count per level (H1, H2, H3, etc.)
- **Heading issues detection** with severity indicators:
  - Missing H1 (error)
  - Multiple H1 tags (warning)
  - Skipped heading levels (warning)
  - First heading not H1 (warning)
- **Full heading tree** with visual indentation by depth
- **Copy all headings** to clipboard in markdown format

### Links Tab
- **Link stats**: total links, internal links, external links
- **Top 5 external domains** by link frequency
- **All links list** (first 50) with internal/external badges, anchor text, and URL

### Keyword Tab
- **Keyword input** with Enter key support
- **Occurrences count** and **density percentage** for the target keyword
- **Placement checks** with pass/fail indicators:
  - Keyword in title
  - Keyword in meta description
  - Keyword in H1

### Full Audit Link
- One-click access to comprehensive audit at `audit.owshsystems.com/page-audit`
- Passes current URL and keyword (if entered) as query parameters

## Scoring Algorithm

The Page Health Score is a weighted composite of four sub-scores:

| Category | Weight | What It Measures |
|----------|--------|------------------|
| Metadata | 25% | Title (presence, length, keyword), description (presence, length, keyword), canonical, OG tags |
| Content Quality | 30% | Word count, Flesch readability, sentence length, image alt text coverage, links, transition words |
| Heading Structure | 20% | H1 presence/count, keyword in H1, hierarchy validity, H2/H3 distribution |
| Keyword Optimization | 25% | Keyword density (1-3% optimal), presence in title, H1, description, URL |

Each sub-score is 0-100, then combined by weight into the overall score.

## Readability Analysis

The extension calculates content readability metrics (used in scoring):
- **Flesch Reading Ease Score** (60-80 optimal range)
- **Average sentence length** (10-20 words optimal)
- **Transition word percentage** (30+ transition words tracked)

## Error Handling

The extension gracefully handles restricted pages that cannot be analyzed:
- `chrome://` system pages
- `chrome-extension://` pages
- `edge://` system pages
- `about:` pages
- `view-source:` pages
- `devtools://` pages
- `file://` local files (with specific guidance message)

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `page-audit-extension` folder

## Building for Production

The extension is ready to use as-is (no build step required). For Chrome Web Store submission:

1. Verify icons in `src/assets/` are present and updated:
   - `icon-16.png` (16x16)
   - `icon-32.png` (32x32)
   - `icon-48.png` (48x48)
   - `icon-128.png` (128x128)

2. Increment the version in `manifest.json`

3. Create a ZIP of the contents of `page-audit-extension/` so `manifest.json` is at the root of the zip

4. Upload to Chrome Web Store Developer Dashboard

Store listing copy and privacy policy text live in `docs/EXTENSION_DOCUMENTATION.md` and `docs/EXTENSION_PRIVACY_POLICY.md`.
Store assets live in `page-audit-extension/store-assets/`.

## Project Structure

```
page-audit-extension/
├── manifest.json               # Extension manifest (v3)
├── src/
│   ├── popup/
│   │   ├── popup.html          # Popup UI (4 tabs)
│   │   ├── popup.css           # Popup styles
│   │   └── popup.js            # Popup logic & analysis engine
│   ├── background/
│   │   └── background.js       # Service worker
│   └── assets/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       ├── icon-128.png
│       └── icon.svg
├── store-assets/
│   ├── screenshots/            # Chrome Web Store screenshots
│   └── promos/                 # Promotional images
└── README.md
```

## Permissions

- `activeTab`: Access the currently active tab for analysis
- `scripting`: Execute content scripts to extract page data

## Privacy

- No data is collected or transmitted
- All analysis happens locally in the browser
- No tracking or analytics
- The only external link is the "See full page audit" button, which opens `audit.owshsystems.com`

## Roadmap

Future enhancement plans live in `docs/EXTENSION_DOCUMENTATION.md`.

## Support

For issues or questions, visit https://owshsystems.com
