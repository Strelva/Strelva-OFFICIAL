/**
 * OWSH A11y Check - Accessibility Checker
 * Clean, highlight-focused UI
 */

// State
let analysisResults = null;
let currentUrl = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initDetailSections();
  initHighlightButtons();
  await runAnalysis();
});

// Tab Navigation
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });

      const contentId = tabName === 'overview' ? 'overviewContent' :
                        tabName === 'highlight' ? 'highlightContent' : 'detailsContent';
      document.getElementById(contentId).classList.remove('hidden');
    });
  });
}

// Detail Section Collapsibles
function initDetailSections() {
  document.querySelectorAll('.detail-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.detail-section');
      section.classList.toggle('open');
    });
  });
}

// Highlight Buttons
function initHighlightButtons() {
  // Highlight All buttons
  ['highlightAllBtn', 'highlightHeroBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        if (!analysisResults) return;
        const allSelectors = [];
        analysisResults.issues
          .filter(i => i.severity !== 'pass' && i.elements)
          .forEach(issue => {
            issue.elements.forEach(el => {
              if (el.selector) allSelectors.push(el.selector);
            });
          });
        if (allSelectors.length > 0) {
          highlightMultipleElements(allSelectors.slice(0, 20));
        }
      });
    }
  });

  // Full Report button
  document.getElementById('fullReportBtn').addEventListener('click', () => {
    const url = `https://audit.owshsystems.com/accessibility?url=${encodeURIComponent(currentUrl)}`;
    chrome.tabs.create({ url });
  });
}

// Main Analysis
async function runAnalysis() {
  showLoading();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      showError('No active tab found', 'Navigate to a webpage and try again.');
      return;
    }

    if (isRestrictedUrl(tab.url)) {
      showError('Cannot analyze this page', 'Chrome system pages cannot be analyzed.');
      await updateBadge(0);
      return;
    }

    currentUrl = tab.url;
    document.getElementById('currentUrl').textContent = currentUrl;
    document.getElementById('footerLink').href = `https://audit.owshsystems.com/accessibility?url=${encodeURIComponent(currentUrl)}`;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: analyzePageAccessibility
    });

    if (!results || !results[0] || !results[0].result) {
      showError('Analysis failed', 'Try refreshing the page.');
      return;
    }

    analysisResults = results[0].result;

    const issueCount = analysisResults.issues.filter(i => i.severity !== 'pass').length;
    await updateBadge(issueCount);

    renderOverview();
    renderHighlightTab();
    renderDetails();

    hideLoading();
    document.getElementById('overviewContent').classList.remove('hidden');

  } catch (error) {
    console.error('Analysis error:', error);
    showError('Analysis failed', error.message || 'An unexpected error occurred.');
  }
}

// Page Analysis Function (Injected into page)
function analyzePageAccessibility() {
  const results = {
    issues: [],
    stats: {
      images: { total: 0, withAlt: 0, withoutAlt: 0, decorative: 0 },
      links: { total: 0, good: 0, generic: 0, empty: 0 },
      forms: { total: 0, labeled: 0, unlabeled: 0 },
      headings: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0, total: 0 }
    },
    headingTree: [],
    landmarks: [],
    elements: {
      images: [],
      links: [],
      forms: []
    }
  };

  // Helper functions
  function getUniqueSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function getPreview(el, maxLength = 80) {
    const html = el.outerHTML;
    return html.length <= maxLength ? html : html.substring(0, maxLength) + '...';
  }

  function getAccessibleName(el) {
    return el.getAttribute('aria-label') ||
           (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
           el.getAttribute('title') ||
           el.textContent?.trim() ||
           el.getAttribute('alt') || '';
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetParent !== null;
  }

  // Check: Document Language
  const htmlEl = document.documentElement;
  const lang = htmlEl.getAttribute('lang');
  if (!lang || lang.trim() === '') {
    results.issues.push({
      id: 'missing-lang', severity: 'critical', title: 'Page language not set',
      wcag: '3.1.1', impact: 'Screen readers won\'t know how to pronounce words correctly.',
      fix: 'Add lang="en" (or your language) to the <html> tag.'
    });
  } else {
    results.issues.push({ id: 'lang-present', severity: 'pass', title: 'Document language specified', wcag: '3.1.1' });
  }

  // Check: Page Title
  const pageTitle = document.title?.trim();
  if (!pageTitle) {
    results.issues.push({
      id: 'missing-title', severity: 'critical', title: 'No page title',
      wcag: '2.4.2', impact: 'Users won\'t know what page they\'re on (shows in tabs & bookmarks).',
      fix: 'Add a <title> tag describing this page.'
    });
  } else if (pageTitle.length < 10 || pageTitle === 'Untitled' || pageTitle === 'Document') {
    results.issues.push({
      id: 'poor-title', severity: 'serious', title: 'Page title too generic',
      wcag: '2.4.2', impact: 'Titles like "Home" or "Page" don\'t tell users what the page is about.',
      fix: 'Use a specific title like "Pricing - Your Company".'
    });
  } else {
    results.issues.push({ id: 'title-present', severity: 'pass', title: 'Page title present', wcag: '2.4.2' });
  }

  // Check: Images
  const images = document.querySelectorAll('img');
  const missingAltImages = [];
  const genericAltImages = [];
  const genericAltPatterns = /^(image|photo|picture|img|graphic|icon|logo|banner|placeholder|untitled|null|undefined|\d+|image\d+|img\d+)$/i;

  images.forEach(img => {
    if (!isVisible(img)) return;
    results.stats.images.total++;
    const alt = img.getAttribute('alt');
    const src = img.src || img.dataset.src || '';
    const selector = getUniqueSelector(img);
    const rect = img.getBoundingClientRect();

    const imgData = { src, selector, preview: getPreview(img, 60), width: Math.round(rect.width), height: Math.round(rect.height) };

    if (alt === null) {
      // Missing alt attribute entirely - always an issue
      results.stats.images.withoutAlt++;
      missingAltImages.push(imgData);
      results.elements.images.push({ ...imgData, status: 'bad', issue: 'missing' });
    } else if (alt === '') {
      // Empty alt = intentionally decorative (consistent with web tool)
      results.stats.images.decorative++;
      results.elements.images.push({ ...imgData, status: 'decorative' });
    } else if (genericAltPatterns.test(alt.trim())) {
      // Generic alt text like "image" or "photo"
      results.stats.images.withAlt++;
      genericAltImages.push({ ...imgData, alt: alt.substring(0, 30) });
      results.elements.images.push({ ...imgData, status: 'bad', issue: 'generic', alt });
    } else {
      // Good alt text
      results.stats.images.withAlt++;
      results.elements.images.push({ ...imgData, status: 'good', alt });
    }
  });

  if (missingAltImages.length > 0) {
    results.issues.push({
      id: 'img-missing-alt', severity: 'critical',
      title: `${missingAltImages.length} image${missingAltImages.length > 1 ? 's' : ''} missing alt attribute`,
      wcag: '1.1.1', impact: 'People who can\'t see these images won\'t know what they show.',
      fix: 'Add alt text describing each image, or alt="" if purely decorative.', elements: missingAltImages
    });
  }

  if (genericAltImages.length > 0) {
    results.issues.push({
      id: 'img-generic-alt', severity: 'serious',
      title: `${genericAltImages.length} image${genericAltImages.length > 1 ? 's' : ''} with generic alt text`,
      wcag: '1.1.1', impact: 'Generic alt text provides no meaningful information.',
      fix: 'Write alt text that describes the image content or purpose.', elements: genericAltImages
    });
  }

  if (missingAltImages.length === 0 && genericAltImages.length === 0 && results.stats.images.total > 0) {
    results.issues.push({ id: 'images-pass', severity: 'pass', title: 'All images have alt text', wcag: '1.1.1' });
  }

  // Check: Links
  // Only flag truly ambiguous links - WCAG 2.4.4 (AA) allows context to clarify purpose
  // "Read more" or "Learn more" in context is usually fine, but "here" or "click here" alone is not
  const genericLinkPatterns = /^(click here|here|click|this|link)$/i;
  const links = document.querySelectorAll('a[href]');
  const emptyLinks = [];
  const genericLinks = [];

  links.forEach(link => {
    if (!isVisible(link)) return;
    results.stats.links.total++;
    const text = getAccessibleName(link).trim();
    const href = link.getAttribute('href');
    const selector = getUniqueSelector(link);
    const linkData = { text: text || '(empty)', href, selector, preview: getPreview(link, 60) };

    if (!text) {
      results.stats.links.empty++;
      emptyLinks.push(linkData);
      results.elements.links.push({ ...linkData, status: 'bad', issue: 'empty' });
    } else if (genericLinkPatterns.test(text)) {
      results.stats.links.generic++;
      genericLinks.push(linkData);
      results.elements.links.push({ ...linkData, status: 'bad', issue: 'generic' });
    } else {
      results.stats.links.good++;
      results.elements.links.push({ ...linkData, status: 'good' });
    }
  });

  if (emptyLinks.length > 0) {
    results.issues.push({
      id: 'links-empty', severity: 'critical',
      title: `${emptyLinks.length} empty link${emptyLinks.length > 1 ? 's' : ''}`,
      wcag: '2.4.4', impact: 'Users won\'t know where these links go.',
      fix: 'Add text describing the link destination.', elements: emptyLinks
    });
  }

  if (genericLinks.length > 0) {
    results.issues.push({
      id: 'links-generic', severity: 'serious',
      title: `${genericLinks.length} link${genericLinks.length > 1 ? 's' : ''} with generic text`,
      wcag: '2.4.4', impact: '"Click here" doesn\'t tell users where the link leads.',
      fix: 'Use text like "View pricing" instead of "click here".', elements: genericLinks
    });
  }

  // Check: Form Labels
  const formFields = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
  const unlabeledFields = [];

  formFields.forEach(field => {
    if (!isVisible(field)) return;
    results.stats.forms.total++;
    const selector = getUniqueSelector(field);
    const id = field.id;
    const name = field.name || field.type;
    const preview = getPreview(field, 60);

    const hasLabel = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') ||
                     (id && document.querySelector(`label[for="${id}"]`)) || field.closest('label');

    if (!hasLabel) {
      results.stats.forms.unlabeled++;
      unlabeledFields.push({ name, selector, preview });
      results.elements.forms.push({ name, selector, preview, status: 'bad' });
    } else {
      results.stats.forms.labeled++;
      results.elements.forms.push({ name, selector, preview, status: 'good' });
    }
  });

  if (unlabeledFields.length > 0) {
    results.issues.push({
      id: 'form-no-label', severity: 'critical',
      title: `${unlabeledFields.length} form field${unlabeledFields.length > 1 ? 's' : ''} without label`,
      wcag: '1.3.1', impact: 'Users won\'t know what info to enter in these fields.',
      fix: 'Add a label for each field (e.g., "Email address").', elements: unlabeledFields
    });
  }

  // Check: Headings
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let previousLevel = 0;
  const skippedHeadings = [];
  const allH1s = [];

  headings.forEach(heading => {
    if (!isVisible(heading)) return;
    const level = parseInt(heading.tagName[1]);
    const text = heading.textContent?.trim() || '';
    const selector = getUniqueSelector(heading);

    results.stats.headings[`h${level}`]++;
    results.stats.headings.total++;
    results.headingTree.push({ level, text: text.substring(0, 100), selector });

    if (level === 1) allH1s.push({ text: text.substring(0, 50), selector });
    if (previousLevel > 0 && level > previousLevel + 1) {
      skippedHeadings.push({ text: text.substring(0, 40), selector, skip: `H${previousLevel} to H${level}` });
    }
    previousLevel = level;
  });

  if (skippedHeadings.length > 0) {
    results.issues.push({
      id: 'heading-skip', severity: 'serious',
      title: `${skippedHeadings.length} skipped heading level${skippedHeadings.length > 1 ? 's' : ''}`,
      wcag: '1.3.1', impact: 'Inconsistent heading structure.',
      fix: 'Maintain sequential heading levels.', elements: skippedHeadings
    });
  }

  if (allH1s.length > 1) {
    results.issues.push({
      id: 'multiple-h1', severity: 'serious', title: `${allH1s.length} H1 elements found`,
      wcag: '1.3.1', impact: 'Document structure is unclear.',
      fix: 'Use only one H1 for the main page title.', elements: allH1s
    });
  } else if (allH1s.length === 0) {
    results.issues.push({
      id: 'missing-h1', severity: 'serious', title: 'Missing H1 heading',
      wcag: '1.3.1', impact: 'Page has no main heading.',
      fix: 'Add an H1 heading.'
    });
  } else {
    results.issues.push({ id: 'h1-pass', severity: 'pass', title: 'Single H1 heading present', wcag: '1.3.1' });
  }

  // Check: Skip Navigation
  const firstFocusable = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  let hasSkipLink = false;
  for (let i = 0; i < Math.min(5, firstFocusable.length); i++) {
    const el = firstFocusable[i];
    if (el.tagName === 'A' && el.getAttribute('href')?.startsWith('#')) {
      const text = getAccessibleName(el).toLowerCase();
      if (text.includes('skip') || text.includes('main') || text.includes('content')) {
        hasSkipLink = true;
        break;
      }
    }
  }

  if (!hasSkipLink) {
    results.issues.push({
      id: 'no-skip-link', severity: 'serious', title: 'No "skip to content" link',
      wcag: '2.4.1', impact: 'Keyboard users have to tab through every menu item to reach content.',
      fix: 'Add a "Skip to main content" link at the top of the page.'
    });
  } else {
    results.issues.push({ id: 'skip-link-pass', severity: 'pass', title: 'Skip navigation link present', wcag: '2.4.1' });
  }

  // Check: Landmarks
  const landmarkElements = {
    main: document.querySelector('main, [role="main"]'),
    nav: document.querySelector('nav, [role="navigation"]'),
    header: document.querySelector('header, [role="banner"]'),
    footer: document.querySelector('footer, [role="contentinfo"]'),
    aside: document.querySelector('aside, [role="complementary"]')
  };

  for (const [name, el] of Object.entries(landmarkElements)) {
    results.landmarks.push({
      name, present: !!el,
      tag: el ? el.tagName.toLowerCase() : name,
      selector: el ? getUniqueSelector(el) : null
    });
  }

  if (!landmarkElements.main) {
    results.issues.push({
      id: 'missing-main', severity: 'moderate', title: 'No <main> section',
      wcag: '1.3.1', impact: 'Screen reader users can\'t jump directly to the main content.',
      fix: 'Wrap your page\'s main content in a <main> tag.'
    });
  }

  // Check: Empty Buttons
  const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
  const emptyButtons = [];
  buttons.forEach(btn => {
    if (!isVisible(btn)) return;
    if (!getAccessibleName(btn)) {
      emptyButtons.push({ preview: getPreview(btn, 60), selector: getUniqueSelector(btn) });
    }
  });

  if (emptyButtons.length > 0) {
    results.issues.push({
      id: 'button-empty', severity: 'critical',
      title: `${emptyButtons.length} button${emptyButtons.length > 1 ? 's' : ''} without accessible name`,
      wcag: '4.1.2', impact: 'Screen reader users cannot determine button purpose.',
      fix: 'Add text content or aria-label.', elements: emptyButtons
    });
  }

  // Check: SVG-only buttons and links (icon buttons without labels)
  const interactiveElements = document.querySelectorAll('a[href], button, [role="button"]');
  const svgOnlyElements = [];
  interactiveElements.forEach(el => {
    if (!isVisible(el)) return;
    // Check if element only contains SVG (no text)
    const hasOnlySvg = el.querySelector('svg') && !el.textContent?.trim();
    if (hasOnlySvg) {
      // Check for accessible name
      const name = el.getAttribute('aria-label') ||
                   el.getAttribute('title') ||
                   (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
                   el.querySelector('svg title')?.textContent ||
                   '';
      if (!name.trim()) {
        svgOnlyElements.push({ preview: getPreview(el, 60), selector: getUniqueSelector(el) });
      }
    }
  });

  if (svgOnlyElements.length > 0) {
    results.issues.push({
      id: 'svg-icon-no-label', severity: 'critical',
      title: `${svgOnlyElements.length} icon button${svgOnlyElements.length > 1 ? 's' : ''} without label`,
      wcag: '4.1.2', impact: 'Screen readers can\'t announce what these icon buttons do.',
      fix: 'Add aria-label describing the button\'s action (e.g., aria-label="Close menu").', elements: svgOnlyElements
    });
  }

  // Check: Iframes without titles
  const iframes = document.querySelectorAll('iframe');
  const iframesWithoutTitle = [];
  iframes.forEach(iframe => {
    if (!isVisible(iframe)) return;
    const title = iframe.getAttribute('title');
    if (!title || !title.trim()) {
      iframesWithoutTitle.push({
        preview: getPreview(iframe, 60),
        selector: getUniqueSelector(iframe),
        src: (iframe.src || '').substring(0, 50)
      });
    }
  });

  if (iframesWithoutTitle.length > 0) {
    results.issues.push({
      id: 'iframe-no-title', severity: 'serious',
      title: `${iframesWithoutTitle.length} iframe${iframesWithoutTitle.length > 1 ? 's' : ''} without title`,
      wcag: '2.4.1', impact: 'Screen reader users won\'t know what content the iframe contains.',
      fix: 'Add a title attribute describing the iframe content (e.g., title="YouTube video player").', elements: iframesWithoutTitle
    });
  }

  // Check: Tables without headers
  const tables = document.querySelectorAll('table');
  const tablesWithoutHeaders = [];
  tables.forEach(table => {
    if (!isVisible(table)) return;
    const cells = table.querySelectorAll('td');
    const headers = table.querySelectorAll('th');
    if (cells.length > 2 && headers.length === 0) {
      tablesWithoutHeaders.push({
        preview: getPreview(table, 60),
        selector: getUniqueSelector(table),
        cells: cells.length
      });
    }
  });

  if (tablesWithoutHeaders.length > 0) {
    results.issues.push({
      id: 'table-no-headers', severity: 'serious',
      title: `${tablesWithoutHeaders.length} data table${tablesWithoutHeaders.length > 1 ? 's' : ''} without headers`,
      wcag: '1.3.1', impact: 'Screen reader users can\'t understand what each column or row means.',
      fix: 'Add <th> elements for column and row headers.', elements: tablesWithoutHeaders
    });
  }

  // Check: Invalid ARIA roles
  const validRoles = ['alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell',
    'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'dialog',
    'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading', 'img',
    'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option',
    'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader',
    'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'switch',
    'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip',
    'tree', 'treegrid', 'treeitem'];

  const elementsWithRole = document.querySelectorAll('[role]');
  const invalidRoles = [];
  elementsWithRole.forEach(el => {
    if (!isVisible(el)) return;
    const role = el.getAttribute('role')?.toLowerCase().trim();
    if (role && !validRoles.includes(role)) {
      invalidRoles.push({ preview: getPreview(el, 50), selector: getUniqueSelector(el), role });
    }
  });

  if (invalidRoles.length > 0) {
    results.issues.push({
      id: 'invalid-aria-role', severity: 'serious',
      title: `${invalidRoles.length} element${invalidRoles.length > 1 ? 's' : ''} with invalid ARIA role`,
      wcag: '4.1.2', impact: 'Invalid roles are ignored by screen readers, breaking accessibility.',
      fix: 'Use valid ARIA role values (e.g., button, navigation, dialog).', elements: invalidRoles
    });
  }

  // Check: Color Contrast (simplified)
  const textElements = document.querySelectorAll('p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6');
  const lowContrastElements = [];

  function parseColor(colorStr) {
    if (!colorStr || colorStr === 'transparent') return null;
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return match ? { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]), a: match[4] ? parseFloat(match[4]) : 1 } : null;
  }

  function getLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function getContrastRatio(fg, bg) {
    const l1 = getLuminance(fg.r, fg.g, fg.b);
    const l2 = getLuminance(bg.r, bg.g, bg.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function getBackgroundColor(el) {
    let current = el;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      // Skip if element has a background image - can't accurately measure contrast
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        return null; // Signal to skip this element
      }
      // Also check for <img> elements inside/nearby that might be positioned behind text
      // Common pattern: parent has position:relative, img has position:absolute covering the area
      const positionedImg = current.querySelector('img');
      if (positionedImg) {
        const imgStyle = window.getComputedStyle(positionedImg);
        const parentStyle = style;
        // Check if img is absolutely/fixed positioned (likely used as background)
        if ((imgStyle.position === 'absolute' || imgStyle.position === 'fixed') &&
            (parentStyle.position === 'relative' || parentStyle.position === 'absolute' || parentStyle.position === 'fixed')) {
          return null; // Can't measure contrast over positioned images
        }
      }
      const bg = style.backgroundColor;
      const parsed = parseColor(bg);
      if (parsed && parsed.a > 0) return bg;
      current = current.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }

  textElements.forEach(el => {
    if (!isVisible(el) || !el.textContent?.trim() || lowContrastElements.length >= 10) return;
    const style = window.getComputedStyle(el);
    const fg = parseColor(style.color);
    const bg = parseColor(getBackgroundColor(el));
    if (fg && bg) {
      const ratio = getContrastRatio(fg, bg);
      const fontSize = parseFloat(style.fontSize);
      const isBold = parseInt(style.fontWeight) >= 700;
      const minRatio = (fontSize >= 18 || (fontSize >= 14 && isBold)) ? 3 : 4.5;
      if (ratio < minRatio && ratio > 1) {
        lowContrastElements.push({
          preview: `"${el.textContent.substring(0, 30).trim()}..." — ${ratio.toFixed(2)}:1 contrast`,
          selector: getUniqueSelector(el),
          ratio: ratio.toFixed(2),
          needed: minRatio
        });
      }
    }
  });

  if (lowContrastElements.length > 0) {
    // Find the lowest ratio for the title
    const lowestRatio = Math.min(...lowContrastElements.map(el => parseFloat(el.ratio)));
    results.issues.push({
      id: 'low-contrast', severity: 'critical',
      title: `${lowContrastElements.length} element${lowContrastElements.length > 1 ? 's' : ''} with low contrast (as low as ${lowestRatio}:1)`,
      wcag: '1.4.3', impact: 'Text is difficult to read. Minimum ratio: 4.5:1 for normal text, 3:1 for large text.',
      fix: 'Increase contrast between text and background colors.', elements: lowContrastElements
    });
  } else {
    results.issues.push({ id: 'contrast-pass', severity: 'pass', title: 'Color contrast appears adequate', wcag: '1.4.3' });
  }

  return results;
}

// Render Functions
function renderOverview() {
  if (!analysisResults) return;
  const { issues, stats } = analysisResults;

  const counts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    serious: issues.filter(i => i.severity === 'serious').length,
    moderate: issues.filter(i => i.severity === 'moderate').length,
    pass: issues.filter(i => i.severity === 'pass').length
  };

  const score = calculateScore(issues);
  const grade = getGrade(score);

  // Score card
  document.getElementById('scoreNumber').textContent = score;
  document.getElementById('scoreGrade').textContent = grade;

  const scoreCard = document.getElementById('scoreCard');
  scoreCard.className = 'score-card';
  if (score >= 90) { scoreCard.classList.add('excellent'); document.getElementById('scoreVerdict').textContent = 'Excellent'; }
  else if (score >= 80) { scoreCard.classList.add('good'); document.getElementById('scoreVerdict').textContent = 'Good'; }
  else if (score >= 70) { scoreCard.classList.add('fair'); document.getElementById('scoreVerdict').textContent = 'Needs Work'; }
  else if (score >= 60) { scoreCard.classList.add('poor'); document.getElementById('scoreVerdict').textContent = 'Poor'; }
  else { scoreCard.classList.add('fail'); document.getElementById('scoreVerdict').textContent = 'Failing'; }

  // Issue counts
  document.getElementById('criticalCount').textContent = counts.critical;
  document.getElementById('seriousCount').textContent = counts.serious;
  document.getElementById('moderateCount').textContent = counts.moderate;
  document.getElementById('passCount').textContent = counts.pass;

  // Stats
  document.getElementById('totalImages').textContent = stats.images.total;
  document.getElementById('totalLinks').textContent = stats.links.total;
  document.getElementById('totalForms').textContent = stats.forms.total;
  document.getElementById('totalHeadings').textContent = stats.headings.total;

  // Top issues
  const problemIssues = issues.filter(i => i.severity !== 'pass' && i.elements && i.elements.length > 0).slice(0, 5);
  const topIssuesList = document.getElementById('topIssuesList');

  if (problemIssues.length === 0) {
    topIssuesList.innerHTML = '<p class="empty-state">No issues to highlight!</p>';
  } else {
    topIssuesList.innerHTML = problemIssues.map(issue => `
      <div class="top-issue-item ${issue.severity}" data-issue-id="${issue.id}">
        <div class="issue-indicator"></div>
        <div class="issue-info">
          <div class="issue-title">${escapeHtml(issue.title)}</div>
          <div class="issue-meta">WCAG ${issue.wcag || 'N/A'}</div>
        </div>
        <button class="issue-highlight-btn" data-issue-id="${issue.id}">Highlight</button>
      </div>
    `).join('');

    topIssuesList.querySelectorAll('.issue-highlight-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const issue = analysisResults.issues.find(i => i.id === btn.dataset.issueId);
        if (issue?.elements) highlightMultipleElements(issue.elements.map(e => e.selector));
      });
    });
  }
}

function renderHighlightTab() {
  if (!analysisResults) return;

  const issues = analysisResults.issues.filter(i => i.severity !== 'pass' && i.elements && i.elements.length > 0);
  const container = document.getElementById('highlightList');

  if (issues.length === 0) {
    container.innerHTML = '<p class="empty-state">No issues to highlight!</p>';
    return;
  }

  const grouped = {
    critical: issues.filter(i => i.severity === 'critical'),
    serious: issues.filter(i => i.severity === 'serious'),
    moderate: issues.filter(i => i.severity === 'moderate')
  };

  let html = '';
  Object.entries(grouped).forEach(([severity, sevIssues]) => {
    if (sevIssues.length === 0) return;
    html += `<div class="highlight-group ${severity}">
      <div class="highlight-group-header">${severity} (${sevIssues.length})</div>`;
    sevIssues.forEach(issue => {
      const count = issue.elements?.length || 0;
      html += `
        <div class="highlight-item">
          <div class="highlight-item-info">
            <div class="highlight-item-title">${escapeHtml(issue.title)}</div>
            <div class="highlight-item-count">${count} element${count !== 1 ? 's' : ''}</div>
          </div>
          <button class="highlight-item-btn" data-issue-id="${issue.id}">Highlight</button>
        </div>`;
    });
    html += '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('.highlight-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const issue = analysisResults.issues.find(i => i.id === btn.dataset.issueId);
      if (issue?.elements) highlightMultipleElements(issue.elements.map(e => e.selector));
    });
  });
}

function renderDetails() {
  if (!analysisResults) return;
  const { stats, headingTree, landmarks, elements } = analysisResults;

  // Images
  document.getElementById('imagesSummary').textContent = `${stats.images.withAlt}/${stats.images.total} with alt`;
  document.getElementById('imagesWithAlt').textContent = stats.images.withAlt;
  document.getElementById('imagesWithoutAlt').textContent = stats.images.withoutAlt;
  document.getElementById('imagesDecorative').textContent = stats.images.decorative;

  const imageGrid = document.getElementById('imageGrid');
  const badImages = elements.images.filter(img => img.status === 'bad');
  const imagesToShow = badImages.slice(0, 7);

  if (badImages.length === 0) {
    imageGrid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">All images have alt text!</p>';
  } else {
    imageGrid.innerHTML = imagesToShow.map(img => `
      <div class="image-thumb bad" data-selector="${escapeHtml(img.selector)}" title="${escapeHtml(img.issue || 'Missing alt')}">
        <img src="${escapeHtml(img.src)}" alt="" onerror="this.style.display='none'; this.parentElement.querySelector('.no-preview').style.display='flex';">
        <div class="no-preview" style="display:none;">?</div>
        <div class="image-thumb-badge">!</div>
      </div>
    `).join('') + (badImages.length > 7 ? `<div class="image-thumb image-more">+${badImages.length - 7}</div>` : '');

    imageGrid.querySelectorAll('.image-thumb[data-selector]').forEach(thumb => {
      thumb.addEventListener('click', () => highlightElement(thumb.dataset.selector));
    });
  }

  // Links
  document.getElementById('linksSummary').textContent = `${stats.links.good}/${stats.links.total} clear`;
  document.getElementById('linksGood').textContent = stats.links.good;
  document.getElementById('linksGeneric').textContent = stats.links.generic;
  document.getElementById('linksEmpty').textContent = stats.links.empty;

  const linksList = document.getElementById('linksList');
  const badLinks = elements.links.filter(l => l.status === 'bad').slice(0, 10);

  if (badLinks.length === 0) {
    linksList.innerHTML = '<p class="empty-state">All links have clear text!</p>';
  } else {
    linksList.innerHTML = badLinks.map(link => `
      <div class="link-item bad" data-selector="${escapeHtml(link.selector)}">
        <div class="link-status"></div>
        <div class="link-text">${escapeHtml(link.text)} - ${escapeHtml((link.href || '').substring(0, 30))}</div>
        <span class="link-type">${link.issue}</span>
      </div>
    `).join('');

    linksList.querySelectorAll('.link-item').forEach(item => {
      item.addEventListener('click', () => highlightElement(item.dataset.selector));
    });
  }

  // Headings
  document.getElementById('headingsSummary').textContent = `${stats.headings.total} total`;

  const headingPills = document.getElementById('headingPills');
  headingPills.innerHTML = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(h =>
    `<span class="heading-pill ${h}">${h.toUpperCase()}: ${stats.headings[h]}</span>`
  ).join('');

  const headingIssues = document.getElementById('headingIssues');
  const headingProblems = analysisResults.issues.filter(i => (i.id.includes('h1') || i.id.includes('heading')) && i.severity !== 'pass');
  headingIssues.innerHTML = headingProblems.map(issue => `
    <div class="heading-issue ${issue.severity === 'serious' ? 'error' : 'warning'}">${escapeHtml(issue.title)}</div>
  `).join('');

  const headingTreeEl = document.getElementById('headingTree');
  headingTreeEl.innerHTML = headingTree.slice(0, 15).map(h => `
    <div class="heading-tree-item h${h.level}" data-selector="${escapeHtml(h.selector)}">
      <span class="heading-level h${h.level}">H${h.level}</span>
      <span class="heading-tree-text">${escapeHtml(h.text)}</span>
    </div>
  `).join('');

  headingTreeEl.querySelectorAll('.heading-tree-item').forEach(item => {
    item.addEventListener('click', () => highlightElement(item.dataset.selector));
  });

  // Forms
  document.getElementById('formsSummary').textContent = `${stats.forms.labeled}/${stats.forms.total} labeled`;
  document.getElementById('formsLabeled').textContent = stats.forms.labeled;
  document.getElementById('formsUnlabeled').textContent = stats.forms.unlabeled;

  const formsList = document.getElementById('formsList');
  const badForms = elements.forms.filter(f => f.status === 'bad').slice(0, 10);

  if (badForms.length === 0) {
    formsList.innerHTML = '<p class="empty-state">All form fields are labeled!</p>';
  } else {
    formsList.innerHTML = badForms.map(form => `
      <div class="form-item bad" data-selector="${escapeHtml(form.selector)}">
        <div class="form-status"></div>
        <div class="form-preview">${escapeHtml(form.preview)}</div>
      </div>
    `).join('');

    formsList.querySelectorAll('.form-item').forEach(item => {
      item.addEventListener('click', () => highlightElement(item.dataset.selector));
    });
  }

  // Landmarks
  document.getElementById('landmarksSummary').textContent = `${landmarks.filter(l => l.present).length}/${landmarks.length} present`;

  const landmarksGrid = document.getElementById('landmarksGrid');
  landmarksGrid.innerHTML = landmarks.map(lm => `
    <div class="landmark-item ${lm.present ? 'present' : 'missing'}" ${lm.selector ? `data-selector="${escapeHtml(lm.selector)}"` : ''}>
      <span class="landmark-icon">${lm.present ? '+' : '-'}</span>
      <span class="landmark-name">&lt;${lm.name}&gt;</span>
    </div>
  `).join('');

  landmarksGrid.querySelectorAll('.landmark-item[data-selector]').forEach(item => {
    item.addEventListener('click', () => highlightElement(item.dataset.selector));
  });
}

// Scoring
function calculateScore(issues) {
  const weights = { critical: 0, serious: 0.5, moderate: 0.8, pass: 1.0 };
  if (issues.length === 0) return 100;
  const weightedSum = issues.reduce((sum, issue) => sum + (weights[issue.severity] || 0), 0);
  let score = Math.round((weightedSum / issues.length) * 100);
  if (issues.some(i => i.severity === 'critical')) score = Math.min(score, 60);
  return Math.max(0, Math.min(100, score));
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// Highlighting
async function highlightElement(selector) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        document.querySelectorAll('.owsh-a11y-highlight').forEach(el => el.remove());
        const element = document.querySelector(sel);
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        const highlight = document.createElement('div');
        highlight.className = 'owsh-a11y-highlight';
        highlight.style.cssText = `position:absolute;top:${rect.top + scrollTop - 4}px;left:${rect.left + scrollLeft - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px;border:3px solid #ef4444;border-radius:4px;background:rgba(239,68,68,0.15);pointer-events:none;z-index:999999;animation:owsh-pulse 0.6s ease-in-out 3;box-shadow:0 0 0 4px rgba(239,68,68,0.3);`;

        if (!document.getElementById('owsh-a11y-styles')) {
          const style = document.createElement('style');
          style.id = 'owsh-a11y-styles';
          style.textContent = `@keyframes owsh-pulse{0%,100%{opacity:1;box-shadow:0 0 0 4px rgba(239,68,68,0.3);}50%{opacity:0.8;box-shadow:0 0 0 8px rgba(239,68,68,0.15);}}`;
          document.head.appendChild(style);
        }

        document.body.appendChild(highlight);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => highlight.remove(), 4000);
      },
      args: [selector]
    });
  } catch (error) {
    console.error('Highlight error:', error);
  }
}

async function highlightMultipleElements(selectors) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sels) => {
        document.querySelectorAll('.owsh-a11y-highlight').forEach(el => el.remove());

        if (!document.getElementById('owsh-a11y-styles')) {
          const style = document.createElement('style');
          style.id = 'owsh-a11y-styles';
          style.textContent = `@keyframes owsh-pulse{0%,100%{opacity:1;box-shadow:0 0 0 4px rgba(239,68,68,0.3);}50%{opacity:0.8;box-shadow:0 0 0 8px rgba(239,68,68,0.15);}}`;
          document.head.appendChild(style);
        }

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        let firstElement = null;

        sels.forEach((sel, idx) => {
          const element = document.querySelector(sel);
          if (!element) return;
          if (!firstElement) firstElement = element;

          const rect = element.getBoundingClientRect();
          const highlight = document.createElement('div');
          highlight.className = 'owsh-a11y-highlight';
          highlight.style.cssText = `position:absolute;top:${rect.top + scrollTop - 4}px;left:${rect.left + scrollLeft - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px;border:3px solid #ef4444;border-radius:4px;background:rgba(239,68,68,0.15);pointer-events:none;z-index:${999999 - idx};animation:owsh-pulse 0.6s ease-in-out 3;box-shadow:0 0 0 4px rgba(239,68,68,0.3);`;

          const badge = document.createElement('span');
          badge.style.cssText = `position:absolute;top:-12px;left:-12px;width:24px;height:24px;background:#ef4444;color:white;border-radius:50%;font-size:12px;font-weight:bold;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;`;
          badge.textContent = idx + 1;
          highlight.appendChild(badge);
          document.body.appendChild(highlight);
        });

        if (firstElement) firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => document.querySelectorAll('.owsh-a11y-highlight').forEach(el => el.remove()), 6000);
      },
      args: [selectors]
    });
  } catch (error) {
    console.error('Highlight multiple error:', error);
  }
}

// Utilities
function isRestrictedUrl(url) {
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
         url.startsWith('edge://') || url.startsWith('about:') ||
         url.startsWith('file://') || url.startsWith('devtools://');
}

function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
}

function hideLoading() {
  document.getElementById('loadingState').classList.add('hidden');
}

function showError(message, hint) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorHint').textContent = hint;
}

async function updateBadge(issueCount) {
  const text = issueCount > 0 ? (issueCount > 99 ? '99+' : String(issueCount)) : '';
  const color = issueCount > 0 ? '#ef4444' : '#10b981';
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (err) {}
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
