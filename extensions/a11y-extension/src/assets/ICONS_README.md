# Icon Assets

## Required Icons

The following PNG icons need to be generated from `icon.svg`:

- `icon-16.png` - 16x16px (favicon, small toolbar)
- `icon-32.png` - 32x32px (toolbar)
- `icon-48.png` - 48x48px (extension management)
- `icon-128.png` - 128x128px (Chrome Web Store)

## How to Generate

### Option 1: Online Converter
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `icon.svg`
3. Set output sizes for each dimension
4. Download and rename

### Option 2: Command Line (requires Inkscape)
```bash
inkscape -w 16 -h 16 icon.svg -o icon-16.png
inkscape -w 32 -h 32 icon.svg -o icon-32.png
inkscape -w 48 -h 48 icon.svg -o icon-48.png
inkscape -w 128 -h 128 icon.svg -o icon-128.png
```

### Option 3: ImageMagick
```bash
convert -background none icon.svg -resize 16x16 icon-16.png
convert -background none icon.svg -resize 32x32 icon-32.png
convert -background none icon.svg -resize 48x48 icon-48.png
convert -background none icon.svg -resize 128x128 icon-128.png
```

## Design Notes

- Primary color: Indigo (#6366F1) - accessibility/inclusivity theme
- Accent: Green (#10B981) - checkmark for "passed" validation
- Icon depicts universal accessibility symbol with a check
- Matches OWSH brand while differentiating from Page Audit (orange) and Snapshot (violet)
