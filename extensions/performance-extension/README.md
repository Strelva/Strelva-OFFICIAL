# Site Performance Checker - OWSH Speed Audit

Chrome extension for instant page performance analysis. Checks Core Web Vitals, resource loading, image optimization, and load timing.

## Features

- **Core Web Vitals**: LCP, CLS, INP with threshold indicators
- **Resource Analysis**: Breakdown by type, largest resources, first/third party split, render-blocking detection
- **Image Optimization**: Oversized images, missing lazy loading, legacy formats, missing dimensions
- **Load Timing**: Resource waterfall, long task detection, font loading, inline resource stats

## Install (Development)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder

## Architecture

```
performance-extension/
  manifest.json           # Manifest V3 config
  src/
    background/
      background.js       # Service worker
    popup/
      popup.html          # 4-tab popup UI
      popup.css           # Styles (CWV cards, timeline, waterfall)
      popup.js            # Analysis engine + rendering
    assets/
      icon-{16,32,48,128}.png  # Extension icons
```

## Scoring

Score is weighted across 4 categories:
- Core Web Vitals (35%)
- Page Weight (25%)
- Resource Optimization (20%)
- Image Optimization (20%)

## Permissions

- `activeTab` - Access the current tab for analysis
- `scripting` - Inject the performance analysis script
