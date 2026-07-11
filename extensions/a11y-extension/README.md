# Site Accessibility Checker — OWSH A11y Check

Free WCAG 2.1 AA accessibility audit for any webpage. One-click analysis of color contrast, alt text, headings, forms, focus indicators, and more. 100% local analysis, no account required.

## Chrome Web Store

**Status:** In Development

**Listing Name:** Site Accessibility Checker — OWSH A11y Check

**Short Description:** Free WCAG accessibility audit for any webpage. Check color contrast, alt text, headings, forms, and more. No account required.

## Features

### Tab 1: Overview
- Accessibility Score (0-100) with letter grade
- Issue breakdown by severity (Critical / Serious / Moderate / Pass)
- Pass rate visualization
- Top 3 priority fixes with quick explanations
- Quick stats (images, links, forms, headings)
- **Copy Report** button — exports full markdown report to clipboard

### Badge Counter
- Shows issue count on the extension icon in the browser toolbar
- Red badge for issues found, green for zero issues
- Immediate visual feedback without opening the popup

### Tab 2: Issues
- Issues grouped by severity (collapsible sections)
- Each issue displays:
  - Element preview (truncated HTML snippet)
  - WCAG criterion reference (e.g., "1.4.3 Contrast Minimum")
  - Impact explanation (why it matters)
  - Fix guidance (how to resolve)
  - "Show" button to highlight individual elements on page
  - "Highlight All" button for issues with multiple affected elements (shows numbered badges)
  - Automatic scroll-to-element behavior

### Tab 3: Elements
- **Interactive Audit:** Buttons, links, form controls with accessibility status
- **Images Audit:** Total count, with alt, without alt, decorative
- **Headings Tree:** Visual hierarchy with level indicators and issues flagged
- **Landmarks:** Page structure visualization (main, nav, header, footer, aside)

## WCAG 2.1 AA Checks

### Critical (Score Impact: Fail = 0 points, caps total at 60)

| Check | WCAG SC | Detection |
|-------|---------|-----------|
| Images missing alt text | 1.1.1 | `img:not([alt])`, `img[alt=""]` |
| Insufficient color contrast | 1.4.3 | Text < 4.5:1, Large text < 3:1 |
| Form inputs without labels | 1.3.1, 3.3.2 | No `<label>`, `aria-label`, or `aria-labelledby` |
| Missing document language | 3.1.1 | `html:not([lang])` or empty lang |
| Empty links or buttons | 2.4.4, 4.1.2 | No text content or accessible name |

### Serious (Score Impact: 0.5 points each)

| Check | WCAG SC | Detection |
|-------|---------|-----------|
| Skipped heading levels | 1.3.1 | H1 → H3 (skipping H2) |
| Multiple H1 elements | 1.3.1 | More than one `<h1>` |
| Generic link text | 2.4.4 | "click here", "read more", "learn more", "here" |
| Missing skip navigation | 2.4.1 | No skip link in first 3 focusable elements |
| Focus not visible | 2.4.7 | `outline: none/0` without `:focus-visible` alternative |
| Icon buttons without labels | 1.1.1, 4.1.2 | SVG/icon font buttons without accessible name |
| Missing form error identification | 3.3.1 | Error states without `aria-invalid` or text |

### Moderate (Score Impact: 0.8 points each)

| Check | WCAG SC | Detection |
|-------|---------|-----------|
| Small touch targets | 2.5.5 | Interactive elements < 44×44px |
| Text smaller than 12px | 1.4.4 | Computed font-size < 12px |
| Missing landmark regions | 1.3.1 | No `<main>`, `<nav>`, `<header>` |
| Data tables without headers | 1.3.1 | `<table>` without `<th>` or `scope` |
| Auto-playing media | 1.4.2 | `<video autoplay>`, `<audio autoplay>` without muted |
| Missing link purpose in context | 2.4.4 | Ambiguous links not clarified by surrounding text |
| Positive tabindex values | 2.4.3 | `tabindex > 0` (disrupts natural order) |

### Informational (Not scored, shown as tips)

| Check | Purpose |
|-------|---------|
| ARIA role usage | Show roles present on page |
| Decorative images | Images with `alt=""` or `role="presentation"` |
| Keyboard traps | Focusable elements that might trap focus |
| Reduced motion preference | Whether `prefers-reduced-motion` is respected |

## Scoring Algorithm

```javascript
function calculateScore(issues) {
  const weights = {
    critical: 0,      // Critical = automatic fail for that check
    serious: 0.5,     // Serious = half credit
    moderate: 0.8,    // Moderate = mostly passing
    pass: 1.0         // Pass = full credit
  }

  const totalChecks = issues.length
  const weightedSum = issues.reduce((sum, issue) => {
    return sum + weights[issue.severity]
  }, 0)

  let score = Math.round((weightedSum / totalChecks) * 100)

  // Critical failures cap score at 60
  const hasCritical = issues.some(i => i.severity === 'critical' && !i.passed)
  if (hasCritical) {
    score = Math.min(score, 60)
  }

  return score
}

function getGrade(score) {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}
```

## Color Contrast Algorithm

Implements WCAG 2.1 contrast ratio calculation:

```javascript
// Relative luminance calculation
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// Contrast ratio (1:1 to 21:1)
function getContrastRatio(color1, color2) {
  const l1 = getLuminance(...color1)
  const l2 = getLuminance(...color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// WCAG AA requirements
// Normal text (< 18pt or < 14pt bold): 4.5:1
// Large text (>= 18pt or >= 14pt bold): 3:1
```

## Project Structure

```
a11y-extension/
├── manifest.json
├── src/
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js              # Main analysis orchestrator
│   │   └── popup.css
│   ├── content/
│   │   └── highlighter.js        # Page overlay for highlighting issues
│   ├── lib/
│   │   ├── colorContrast.js      # WCAG contrast calculations
│   │   ├── imageAnalyzer.js      # Alt text detection
│   │   ├── headingAnalyzer.js    # Heading hierarchy validation
│   │   ├── formAnalyzer.js       # Form label/error detection
│   │   ├── linkAnalyzer.js       # Link text and purpose analysis
│   │   ├── focusAnalyzer.js      # Focus indicator detection
│   │   ├── landmarkAnalyzer.js   # ARIA landmarks and regions
│   │   ├── interactiveAnalyzer.js # Buttons, touch targets
│   │   └── scoring.js            # Score calculation
│   ├── background/
│   │   └── background.js         # Service worker
│   └── assets/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       ├── icon-128.png
│       └── icon.svg
├── store-assets/
│   ├── screenshot-1.png          # Overview tab
│   ├── screenshot-2.png          # Issues tab
│   ├── screenshot-3.png          # Elements tab
│   ├── screenshot-4.png          # Highlight feature
│   ├── promo-tile-440x280.png
│   └── promo-tile-1400x560.png
├── STORE_LISTING.md
└── README.md
```

## Permissions

```json
{
  "permissions": [
    "activeTab",
    "scripting"
  ]
}
```

Minimal permissions:
- `activeTab`: Access current tab only when user clicks extension
- `scripting`: Inject content script for page highlighting

## Development

### Setup
```bash
cd a11y-extension
# No build step required - vanilla JS
```

### Load in Chrome
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `a11y-extension` folder

### Testing
Test on pages with known accessibility issues:
- https://www.w3.org/WAI/demos/bad/before/home.html (intentionally inaccessible)
- https://www.w3.org/WAI/demos/bad/after/home.html (fixed version)

## Privacy

- All analysis runs 100% locally in the browser
- No data sent to any server
- No tracking or analytics
- No account required
- Works offline after installation

## Chrome Web Store Listing

See `STORE_LISTING.md` for full listing copy, screenshots requirements, and submission checklist.

## Integration with OWSH Systems

### Web App Links
- Browser extension page: `/browser-extension` (third card)
- Web version: `audit.owshsystems.com/accessibility`
- Privacy policy: `/privacy/a11y-extension`

### Related Tools
- Page Audit extension: On-page SEO analysis
- Snapshot extension: Schema & sitemap checking
- Website page Accessibility checks: Deep accessibility audit in main app

## Roadmap

### v1.0.0 (Launch)
- [x] Core WCAG AA checks (Critical + Serious + Moderate)
- [x] 3-tab UI (Overview, Issues, Elements)
- [x] Scoring system with letter grades
- [x] Highlight on page feature (single + multiple elements)
- [x] Badge counter showing issue count
- [x] Copy Report to clipboard (markdown format)
- [ ] Generate PNG icons from SVG
- [ ] Chrome Web Store submission

### v1.1.0 (Post-launch)
- [ ] Moderate severity checks
- [ ] Export report as PDF/JSON
- [ ] Keyboard navigation testing mode
- [ ] Color blindness simulation

### v1.2.0 (Future)
- [ ] AAA level checks (optional toggle)
- [ ] Page comparison (before/after)
- [ ] Batch URL testing
- [ ] Integration with OWSH web app account

## WCAG Reference

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [Understanding WCAG 2.1](https://www.w3.org/WAI/WCAG21/Understanding/)
- [WCAG Techniques](https://www.w3.org/WAI/WCAG21/Techniques/)

## License

Proprietary - OWSH Systems
