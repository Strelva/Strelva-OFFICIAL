// Page data storage
let pageData = null;
let currentKeyword = '';

const restrictedUrlPrefixes = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
  'devtools://'
];

function getRestrictedReason(url) {
  if (!url) return 'No active tab URL found.';
  if (url.startsWith('file://')) {
    return 'File URLs require enabling "Allow access to file URLs" in chrome://extensions.';
  }
  if (restrictedUrlPrefixes.some(prefix => url.startsWith(prefix))) {
    return 'This page is restricted by Chrome and cannot be analyzed.';
  }
  return '';
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await loadPageData();
});

// Tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
}

function getKeywordInputValue() {
  const input = document.getElementById('keyword-input');
  return input?.value.trim() || '';
}

function setKeywordResultsVisible(showResults) {
  const resultsEl = document.getElementById('keyword-results');
  const emptyStateEl = document.getElementById('keyword-empty-state');

  if (showResults) {
    resultsEl?.classList.remove('hidden');
    emptyStateEl?.classList.add('hidden');
  } else {
    resultsEl?.classList.add('hidden');
    emptyStateEl?.classList.remove('hidden');
  }
}

function updateKeywordButtonState() {
  const analyzeBtn = document.getElementById('analyze-keyword');
  const canAnalyze = !!pageData && getKeywordInputValue().length > 0;

  if (analyzeBtn) {
    analyzeBtn.disabled = !canAnalyze;
  }
}

// Event listeners
function setupEventListeners() {
  // Full audit button
  document.getElementById('full-audit-btn')?.addEventListener('click', openFullAudit);

  // Copy headings
  document.getElementById('copy-headings')?.addEventListener('click', copyHeadings);

  // Keyword analysis
  const analyzeBtn = document.getElementById('analyze-keyword');
  const keywordInput = document.getElementById('keyword-input');
  const triggerAnalysis = () => {
    const keyword = getKeywordInputValue();
    if (keyword) {
      analyzeKeyword(keyword);
    }
  };

  analyzeBtn?.addEventListener('click', triggerAnalysis);

  // Enter key for keyword input
  keywordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerAnalysis();
    }
  });

  keywordInput?.addEventListener('input', () => {
    const value = getKeywordInputValue();
    if (!value) {
      currentKeyword = '';
      setKeywordResultsVisible(false);
      if (pageData) {
        renderOverview();
      }
    } else if (currentKeyword && value.toLowerCase() !== currentKeyword) {
      setKeywordResultsVisible(false);
    }
    updateKeywordButtonState();
  });

  updateKeywordButtonState();
  setKeywordResultsVisible(false);
}

// Load page data from active tab
async function loadPageData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    pageData = null;
    updateKeywordButtonState();

    if (!tab.id || !tab.url) {
      showError('Cannot analyze this page', 'No active tab URL found.');
      return;
    }

    const restrictedReason = getRestrictedReason(tab.url);
    if (restrictedReason) {
      showError('Cannot analyze this page', restrictedReason);
      return;
    }

    // Execute content script to extract page data
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData
    });

    const result = results?.[0]?.result;
    if (result) {
      pageData = result;
      renderOverview();
      renderHeadings();
      renderLinks();
      renderVisualAssets();
      renderImagesMissingAlt();
      updateKeywordButtonState();
    } else {
      showError('Failed to analyze page', 'Unable to read page data.');
    }
  } catch (error) {
    console.error('Error loading page data:', error);
    showError('Failed to analyze page', 'Try refreshing the page or opening a different website.');
  }
}

// Content script function - extracts all page data
function extractPageData() {
  const extractBodyText = (html) => {
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1];
    }

    content = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return content;
  };

  const getWords = (text) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  };

  const getOgTagCount = () => {
    const tags = new Set();
    document.querySelectorAll('meta[property^="og:"]').forEach((meta) => {
      const property = meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (property && content) {
        tags.add(property);
      }
    });
    return tags.size;
  };

  const countImages = () => {
    const images = Array.from(document.querySelectorAll('img'));
    let withAlt = 0;
    images.forEach((img) => {
      const alt = img.getAttribute('alt');
      if (alt && alt.trim().length > 0) {
        withAlt += 1;
      }
    });
    return { total: images.length, withAlt };
  };

  const countLinks = () => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let internal = 0;
    let external = 0;
    const pageUrl = window.location.href;
    let pageHost = '';

    try {
      pageHost = new URL(pageUrl).hostname;
    } catch {
      pageHost = '';
    }

    anchors.forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        return;
      }

      try {
        const linkUrl = new URL(href, pageUrl);
        if (linkUrl.hostname === pageHost) {
          internal += 1;
        } else {
          external += 1;
        }
      } catch {
        internal += 1;
      }
    });

    return { total: anchors.length, internal, external };
  };

  // Extract detailed links with domains
  const extractDetailedLinks = () => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const pageUrl = window.location.href;
    let pageHost = '';
    const domainCounts = {};
    const links = [];

    try {
      pageHost = new URL(pageUrl).hostname;
    } catch {
      pageHost = '';
    }

    anchors.forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      const text = anchor.textContent?.trim() || '';

      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        return;
      }

      try {
        const linkUrl = new URL(href, pageUrl);
        const isInternal = linkUrl.hostname === pageHost;
        const domain = isInternal ? null : linkUrl.hostname;

        links.push({ href: linkUrl.href, text, isInternal, domain });

        if (!isInternal && domain) {
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        }
      } catch {
        links.push({ href, text, isInternal: true, domain: null });
      }
    });

    // Get top 5 external domains
    const topExternalDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    return { links, topExternalDomains };
  };

  // Extract visual assets (favicon, OG image)
  const extractVisualAssets = () => {
    // Favicon
    let favicon = null;
    const faviconLink = document.querySelector('link[rel="icon"]') ||
                        document.querySelector('link[rel="shortcut icon"]') ||
                        document.querySelector('link[rel="apple-touch-icon"]');
    if (faviconLink) {
      const href = faviconLink.getAttribute('href');
      if (href) {
        try {
          favicon = new URL(href, window.location.href).href;
        } catch {
          favicon = href;
        }
      }
    }

    // OG Image
    let ogImage = null;
    const ogImageMeta = document.querySelector('meta[property="og:image"]');
    if (ogImageMeta) {
      ogImage = ogImageMeta.getAttribute('content');
    }

    // OG Title
    let ogTitle = null;
    const ogTitleMeta = document.querySelector('meta[property="og:title"]');
    if (ogTitleMeta) {
      ogTitle = ogTitleMeta.getAttribute('content');
    }

    // OG Description
    let ogDescription = null;
    const ogDescMeta = document.querySelector('meta[property="og:description"]');
    if (ogDescMeta) {
      ogDescription = ogDescMeta.getAttribute('content');
    }

    return {
      favicon,
      ogImage,
      ogTitle,
      ogDescription,
      hasFavicon: !!favicon,
      hasOgImage: !!ogImage
    };
  };

  // Extract detailed images
  const extractDetailedImages = () => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.map((img) => {
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt');
      let fullSrc = null;

      if (src) {
        try {
          fullSrc = new URL(src, window.location.href).href;
        } catch {
          fullSrc = src;
        }
      }

      return {
        src: fullSrc,
        alt: alt,
        hasAlt: alt !== null && alt.trim().length > 0
      };
    });
  };

  // Get title
  const title = document.title || '';

  // Get meta description
  const descMeta = document.querySelector('meta[name="description"]');
  const description = descMeta ? descMeta.getAttribute('content') || '' : '';

  // Get canonical
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  const canonical = canonicalLink ? canonicalLink.getAttribute('href') : null;

  // Get language
  const language = document.documentElement.lang || '';

  // Get body text and word count
  const html = document.documentElement?.outerHTML || '';
  const bodyText = extractBodyText(html);
  const words = getWords(bodyText);
  const wordCount = words.length;

  const imageData = countImages();
  const linkData = countLinks();
  const ogTagCount = getOgTagCount();
  const detailedLinkData = extractDetailedLinks();
  const visualAssets = extractVisualAssets();
  const detailedImages = extractDetailedImages();

  // Extract headings
  const headings = [];
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    const level = parseInt(el.tagName[1]);
    const text = el.textContent?.trim() || '';
    if (text) {
      headings.push({ level, text });
    }
  });

  return {
    url: window.location.href,
    title,
    description,
    canonical,
    language,
    wordCount,
    imageCount: imageData.total,
    imagesWithAlt: imageData.withAlt,
    linkCount: linkData.total,
    internalLinks: linkData.internal,
    externalLinks: linkData.external,
    ogTagCount,
    headings,
    bodyText,
    // New detailed data
    links: detailedLinkData.links,
    topExternalDomains: detailedLinkData.topExternalDomains,
    visualAssets,
    images: detailedImages
  };
}

// Render overview tab
function renderOverview() {
  if (!pageData) return;

  // Hide loading, show content
  document.getElementById('loading-state')?.classList.add('hidden');
  document.getElementById('overview-content')?.classList.remove('hidden');

  // Calculate verdict
  const verdict = calculateVerdict();

  // Update score display
  const scoreValueEl = document.getElementById('score-value');
  const scoreLabelEl = document.getElementById('score-label');
  if (scoreValueEl) {
    scoreValueEl.textContent = `${verdict.score}/100`;
    scoreValueEl.className = `score-value ${verdict.class}`;
  }
  if (scoreLabelEl) {
    scoreLabelEl.textContent = verdict.label;
    scoreLabelEl.className = `score-label ${verdict.class}`;
  }

  // Show top priority fix
  const topPriorityEl = document.getElementById('top-priority-panel');
  const topPriorityTextEl = document.getElementById('top-priority-text');
  const topFix = getTopPriorityFix();

  if (topFix && topPriorityEl && topPriorityTextEl) {
    topPriorityTextEl.textContent = topFix;
    topPriorityEl.classList.remove('hidden');
  } else if (topPriorityEl) {
    topPriorityEl.classList.add('hidden');
  }

  // Page info
  document.getElementById('page-title').textContent = pageData.title || 'No title found';
  document.getElementById('title-length').textContent = `${pageData.title?.length || 0} characters`;

  document.getElementById('page-description').textContent = pageData.description || 'No description found';
  document.getElementById('description-length').textContent = `${pageData.description?.length || 0} characters`;

  document.getElementById('page-url').textContent = pageData.url;

  // Stats
  document.getElementById('word-count').textContent = formatNumber(pageData.wordCount);
  document.getElementById('image-count').textContent = pageData.imageCount;
  document.getElementById('link-count').textContent = pageData.linkCount;
  document.getElementById('language').textContent = pageData.language || '-';

  // Heading counts
  const counts = getHeadingCounts();
  const countsEl = document.getElementById('heading-counts');
  if (countsEl) {
    countsEl.innerHTML = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([level, count]) => `<div class="heading-count"><span>H${level}</span>${count}</div>`)
      .join('') || '<span class="empty-state">No headings found.</span>';
  }

  // Canonical
  const canonicalEl = document.getElementById('canonical-status');
  if (canonicalEl) {
    if (pageData.canonical) {
      canonicalEl.textContent = `Found: ${pageData.canonical}`;
      canonicalEl.className = 'found';
    } else {
      canonicalEl.textContent = 'Not found';
      canonicalEl.className = 'not-found';
    }
  }
}

// Render headings tab with tree view and issue highlighting
function renderHeadings() {
  if (!pageData) return;

  const copyBtn = document.getElementById('copy-headings');
  const hasHeadings = pageData.headings.length > 0;
  if (copyBtn) {
    copyBtn.disabled = !hasHeadings;
    copyBtn.textContent = hasHeadings ? 'Copy all headings' : 'No headings to copy';
  }

  // Heading pills
  const counts = getHeadingCounts();
  const pillsEl = document.getElementById('heading-pills');
  if (pillsEl) {
    pillsEl.innerHTML = Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([level, count]) => `<div class="heading-count"><span>H${level}</span>${count}</div>`)
      .join('') || '<span class="empty-state">No headings found on this page.</span>';
  }

  // Detect heading issues
  const issues = detectHeadingIssues();
  const issuesEl = document.getElementById('heading-issues');
  if (issuesEl) {
    if (issues.length > 0) {
      issuesEl.innerHTML = issues.map(issue => `
        <div class="heading-issue ${issue.severity}">
          <span class="issue-icon">${issue.severity === 'error' ? '!' : '⚠'}</span>
          <span class="issue-text">${escapeHtml(issue.message)}</span>
        </div>
      `).join('');
    } else if (hasHeadings) {
      issuesEl.innerHTML = '<div class="heading-issue success"><span class="issue-icon">✓</span><span class="issue-text">Heading structure looks good</span></div>';
    } else {
      issuesEl.innerHTML = '';
    }
  }

  // Headings list with tree view
  const listEl = document.getElementById('headings-list');
  if (listEl) {
    if (pageData.headings.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No headings found on this page.</p>';
    } else {
      // Build tree view with indentation based on level
      let prevLevel = 0;
      listEl.innerHTML = pageData.headings
        .map((h, index) => {
          const skipIssue = prevLevel > 0 && h.level > prevLevel + 1;
          prevLevel = h.level;
          const indent = (h.level - 1) * 16; // 16px per level
          return `
            <div class="heading-item ${skipIssue ? 'has-issue' : ''}" style="padding-left: ${indent}px">
              <span class="heading-level h${h.level}">H${h.level}</span>
              <span class="heading-text">${escapeHtml(h.text)}</span>
              ${skipIssue ? '<span class="heading-warning" title="Skipped heading level">⚠</span>' : ''}
            </div>
          `;
        })
        .join('');
    }
  }
}

// Detect heading structure issues
function detectHeadingIssues() {
  if (!pageData || !pageData.headings) return [];

  const issues = [];
  const h1Count = pageData.headings.filter(h => h.level === 1).length;

  // Check for missing H1
  if (h1Count === 0) {
    issues.push({
      severity: 'error',
      message: 'Missing H1 heading'
    });
  }

  // Check for multiple H1s
  if (h1Count > 1) {
    issues.push({
      severity: 'warning',
      message: `Multiple H1 headings found (${h1Count})`
    });
  }

  // Check for skipped levels
  let prevLevel = 0;
  for (const heading of pageData.headings) {
    if (prevLevel > 0 && heading.level > prevLevel + 1) {
      issues.push({
        severity: 'warning',
        message: `Skipped heading level: H${prevLevel} → H${heading.level}`
      });
      break; // Only report first skip
    }
    prevLevel = heading.level;
  }

  // Check if first heading is not H1
  if (pageData.headings.length > 0 && pageData.headings[0].level > 1) {
    issues.push({
      severity: 'warning',
      message: `Page starts with H${pageData.headings[0].level} instead of H1`
    });
  }

  return issues;
}

// Render links tab
function renderLinks() {
  if (!pageData) return;

  // Stats
  document.getElementById('total-links').textContent = pageData.linkCount;
  document.getElementById('internal-links').textContent = pageData.internalLinks;
  document.getElementById('external-links').textContent = pageData.externalLinks;

  // Top external domains
  const domainsEl = document.getElementById('external-domains');
  if (domainsEl) {
    if (pageData.topExternalDomains && pageData.topExternalDomains.length > 0) {
      domainsEl.innerHTML = pageData.topExternalDomains.map(d => `
        <div class="domain-item">
          <span class="domain-name">${escapeHtml(d.domain)}</span>
          <span class="domain-count">${d.count}</span>
        </div>
      `).join('');
    } else {
      domainsEl.innerHTML = '<p class="empty-state">No external links found.</p>';
    }
  }

  // Links list
  const linksListEl = document.getElementById('links-list');
  if (linksListEl) {
    if (pageData.links && pageData.links.length > 0) {
      // Show first 50 links to avoid performance issues
      const displayLinks = pageData.links.slice(0, 50);
      linksListEl.innerHTML = displayLinks.map(link => `
        <div class="link-item ${link.isInternal ? 'internal' : 'external'}">
          <span class="link-type">${link.isInternal ? 'INT' : 'EXT'}</span>
          <div class="link-details">
            <span class="link-text">${escapeHtml(truncate(link.text || '(no text)', 40))}</span>
            <span class="link-href">${escapeHtml(truncate(link.href, 50))}</span>
          </div>
        </div>
      `).join('');
      if (pageData.links.length > 50) {
        linksListEl.innerHTML += `<p class="empty-state">Showing first 50 of ${pageData.links.length} links</p>`;
      }
    } else {
      linksListEl.innerHTML = '<p class="empty-state">No links found.</p>';
    }
  }
}

// Render visual assets section
function renderVisualAssets() {
  if (!pageData || !pageData.visualAssets) return;

  const va = pageData.visualAssets;

  // Favicon
  const faviconPreviewEl = document.getElementById('favicon-preview');
  const faviconStatusEl = document.querySelector('#favicon-status .asset-status');
  if (faviconPreviewEl && faviconStatusEl) {
    if (va.favicon) {
      faviconPreviewEl.innerHTML = `<img src="${escapeHtml(va.favicon)}" alt="Favicon" onerror="this.style.display='none'">`;
      faviconStatusEl.textContent = 'Found';
      faviconStatusEl.className = 'asset-status found';
    } else {
      faviconPreviewEl.innerHTML = '<span class="no-asset">?</span>';
      faviconStatusEl.textContent = 'Missing';
      faviconStatusEl.className = 'asset-status missing';
    }
  }

  // OG Image
  const ogPreviewEl = document.getElementById('og-preview');
  const ogStatusEl = document.querySelector('#og-image-status .asset-status');
  if (ogPreviewEl && ogStatusEl) {
    if (va.ogImage) {
      ogPreviewEl.innerHTML = `<img src="${escapeHtml(va.ogImage)}" alt="OG Image" onerror="this.style.display='none'">`;
      ogStatusEl.textContent = 'Found';
      ogStatusEl.className = 'asset-status found';
    } else {
      ogPreviewEl.innerHTML = '<span class="no-asset">?</span>';
      ogStatusEl.textContent = 'Missing';
      ogStatusEl.className = 'asset-status missing';
    }
  }
}

// Render images missing alt section
function renderImagesMissingAlt() {
  if (!pageData || !pageData.images) return;

  const missingAlt = pageData.images.filter(img => !img.hasAlt);
  const totalImages = pageData.images.length;
  const withAlt = totalImages - missingAlt.length;

  // Summary
  const summaryEl = document.getElementById('images-summary');
  if (summaryEl) {
    if (totalImages === 0) {
      summaryEl.innerHTML = '<p class="empty-state">No images found on this page.</p>';
    } else {
      const percentage = Math.round((withAlt / totalImages) * 100);
      const statusClass = percentage === 100 ? 'good' : percentage >= 80 ? 'fair' : 'poor';
      summaryEl.innerHTML = `
        <div class="images-stat">
          <span class="stat-label">Images with alt text:</span>
          <span class="stat-value ${statusClass}">${withAlt}/${totalImages} (${percentage}%)</span>
        </div>
      `;
    }
  }

  // Missing alt images with thumbnails
  const missingEl = document.getElementById('images-missing-alt');
  if (missingEl) {
    if (missingAlt.length > 0) {
      // Show first 8 images
      const displayImages = missingAlt.slice(0, 8);
      missingEl.innerHTML = `
        <p class="missing-alt-title">Missing alt text (${missingAlt.length}):</p>
        <div class="missing-alt-grid">
          ${displayImages.map(img => `
            <div class="missing-alt-item" title="${escapeHtml(img.src || 'Unknown source')}">
              ${img.src ? `<img src="${escapeHtml(img.src)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'no-preview\\'>?</span>'">` : '<span class="no-preview">?</span>'}
            </div>
          `).join('')}
          ${missingAlt.length > 8 ? `<div class="missing-alt-more">+${missingAlt.length - 8} more</div>` : ''}
        </div>
      `;
    } else if (totalImages > 0) {
      missingEl.innerHTML = '<p class="all-good">✓ All images have alt text</p>';
    } else {
      missingEl.innerHTML = '';
    }
  }
}

// Analyze keyword
function analyzeKeyword(keyword) {
  if (!pageData) return;

  currentKeyword = keyword.trim().toLowerCase();
  if (!currentKeyword) return;

  setKeywordResultsVisible(true);

  // Count occurrences
  const bodyText = pageData.bodyText || '';
  const occurrences = countKeywordOccurrences(bodyText, currentKeyword);
  const density = pageData.wordCount > 0
    ? ((occurrences / pageData.wordCount) * 100).toFixed(2)
    : '0.00';

  document.getElementById('keyword-occurrences').textContent = occurrences;
  document.getElementById('keyword-density').textContent = `${density}%`;

  // Check title
  renderKeywordCheck(
    'check-title',
    pageData.title?.toLowerCase().includes(currentKeyword),
    pageData.title || 'No title'
  );

  // Check description
  renderKeywordCheck(
    'check-description',
    pageData.description?.toLowerCase().includes(currentKeyword),
    pageData.description || 'No description'
  );

  // Check H1
  const h1 = pageData.headings.find(h => h.level === 1);
  renderKeywordCheck(
    'check-h1',
    h1?.text.toLowerCase().includes(currentKeyword) || false,
    h1?.text || 'No H1 found'
  );

  renderOverview();
}

function renderKeywordCheck(elementId, pass, content) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const icon = el.querySelector('.check-icon');
  const contentEl = el.querySelector('.check-content');

  if (icon) {
    icon.className = `check-icon ${pass ? 'pass' : 'fail'}`;
    icon.textContent = pass ? '✓' : '✗';
  }

  if (contentEl) {
    contentEl.textContent = truncate(content, 100);
  }
}

// Open full audit
function openFullAudit() {
  if (!pageData) return;

  const url = encodeURIComponent(pageData.url);
  const keywordValue = getKeywordInputValue() || currentKeyword;
  const keywordParam = keywordValue ? `&keyword=${encodeURIComponent(keywordValue)}` : '';
  const auditUrl = `https://audit.owshsystems.com/page-audit?url=${url}${keywordParam}`;

  chrome.tabs.create({ url: auditUrl });
}

// Copy headings
function copyHeadings() {
  if (!pageData || pageData.headings.length === 0) return;

  const text = pageData.headings
    .map(h => `${'#'.repeat(h.level)} ${h.text}`)
    .join('\n');

  const btn = document.getElementById('copy-headings');
  const original = btn?.textContent || 'Copy all headings';

  const setButtonText = (label) => {
    if (!btn) return;
    btn.textContent = label;
    setTimeout(() => {
      if (btn) btn.textContent = original;
    }, 2000);
  };

  const onSuccess = () => setButtonText('Copied!');
  const onFailure = () => setButtonText('Copy failed');

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      if (fallbackCopy(text)) {
        onSuccess();
      } else {
        onFailure();
      }
    });
  } else if (fallbackCopy(text)) {
    onSuccess();
  } else {
    onFailure();
  }
}

function calculateAuditScores(keyword) {
  const metadataScore = calculateMetadataScore(keyword);
  const contentScore = calculateContentScore();
  const headingScore = calculateHeadingScore(keyword);
  const keywordScore = calculateKeywordScore(keyword);

  const overall = Math.round(
    metadataScore * 0.25 +
    contentScore * 0.30 +
    headingScore * 0.20 +
    keywordScore * 0.25
  );

  return {
    overall,
    metadata: metadataScore,
    content: contentScore,
    headings: headingScore,
    keywords: keywordScore
  };
}

function calculateMetadataScore(keyword) {
  if (!pageData) return 0;
  let score = 0;
  const keywordLower = keyword.toLowerCase();
  const title = pageData.title || '';
  const description = pageData.description || '';
  const titleLength = title.length;
  const descriptionLength = description.length;

  if (title) {
    score += 10;
    if (titleLength >= 30 && titleLength <= 60) {
      score += 15;
    } else if (titleLength > 0 && titleLength < 70) {
      score += 8;
    }
    if (title.toLowerCase().includes(keywordLower)) {
      score += 15;
    }
  }

  if (description) {
    score += 10;
    if (descriptionLength >= 120 && descriptionLength <= 160) {
      score += 15;
    } else if (descriptionLength > 50 && descriptionLength < 200) {
      score += 8;
    }
    if (description.toLowerCase().includes(keywordLower)) {
      score += 15;
    }
  }

  if (pageData.canonical) {
    score += 10;
  }

  if (pageData.ogTagCount >= 3) {
    score += 10;
  } else if (pageData.ogTagCount > 0) {
    score += 5;
  }

  return Math.min(100, score);
}

function calculateContentScore() {
  if (!pageData) return 0;
  let score = 0;

  if (pageData.wordCount >= 300) {
    score += 25;
  } else if (pageData.wordCount >= 150) {
    score += 15;
  } else if (pageData.wordCount >= 50) {
    score += 8;
  }

  const readability = analyzeReadability(pageData.bodyText);
  const fleschScore = readability.fleschScore;
  if (fleschScore >= 60 && fleschScore <= 80) {
    score += 25;
  } else if (fleschScore >= 50 && fleschScore <= 90) {
    score += 18;
  } else if (fleschScore >= 30) {
    score += 10;
  }

  const avgSentenceLength = readability.avgSentenceLength;
  if (avgSentenceLength >= 10 && avgSentenceLength <= 20) {
    score += 15;
  } else if (avgSentenceLength >= 8 && avgSentenceLength <= 25) {
    score += 10;
  } else if (avgSentenceLength > 0) {
    score += 5;
  }

  if (pageData.imageCount > 0) {
    score += 5;
    const altRatio = pageData.imagesWithAlt / pageData.imageCount;
    if (altRatio >= 0.9) {
      score += 10;
    } else if (altRatio >= 0.5) {
      score += 5;
    }
  } else if (pageData.wordCount < 200) {
    score += 10;
  }

  if (pageData.internalLinks >= 1) {
    score += 5;
  }
  if (pageData.linkCount >= 2) {
    score += 5;
  }

  if (readability.transitionPercent >= 30) {
    score += 10;
  } else if (readability.transitionPercent >= 15) {
    score += 5;
  }

  return Math.min(100, score);
}

function calculateHeadingScore(keyword) {
  if (!pageData) return 0;
  let score = 0;
  const keywordLower = keyword.toLowerCase();
  const h1Count = pageData.headings.filter(h => h.level === 1).length;
  const h2Count = pageData.headings.filter(h => h.level === 2).length;
  const h3Count = pageData.headings.filter(h => h.level === 3).length;
  const hasKeywordInH1 = pageData.headings
    .filter(h => h.level === 1)
    .some(h => h.text.toLowerCase().includes(keywordLower));
  const hierarchyValid = validateHierarchy(pageData.headings);

  if (h1Count === 1) {
    score += 30;
  } else if (h1Count > 1) {
    score += 10;
  }

  if (hasKeywordInH1) {
    score += 25;
  }

  if (hierarchyValid) {
    score += 20;
  }

  if (h2Count >= 2) {
    score += 10;
  } else if (h2Count >= 1) {
    score += 5;
  }
  if (h3Count >= 1) {
    score += 5;
  }

  const subheadingsWithKeyword = pageData.headings
    .filter(h => h.level > 1 && h.text.toLowerCase().includes(keywordLower))
    .length;
  if (subheadingsWithKeyword >= 2) {
    score += 10;
  } else if (subheadingsWithKeyword >= 1) {
    score += 5;
  }

  return Math.min(100, score);
}

function calculateKeywordScore(keyword) {
  const keywordData = analyzeKeywordData(keyword);
  if (!keywordData) return 0;

  let score = 0;
  if (keywordData.density >= 1 && keywordData.density <= 3) {
    score += 30;
  } else if (keywordData.density >= 0.5 && keywordData.density <= 4) {
    score += 20;
  } else if (keywordData.density > 0 && keywordData.density <= 5) {
    score += 10;
  }

  if (keywordData.inTitle) score += 20;
  if (keywordData.inH1) score += 20;
  if (keywordData.inDescription) score += 15;
  if (keywordData.inUrl) score += 15;

  return Math.min(100, score);
}

function analyzeKeywordData(keyword) {
  if (!pageData) return null;
  const bodyText = pageData.bodyText || '';
  const words = getWords(bodyText);
  const occurrences = countKeywordOccurrences(bodyText, keyword);
  const density = words.length > 0
    ? Math.round((occurrences / words.length) * 1000) / 10
    : 0;

  const keywordLower = keyword.toLowerCase();
  const inTitle = pageData.title
    ? pageData.title.toLowerCase().includes(keywordLower)
    : false;
  const inDescription = pageData.description
    ? pageData.description.toLowerCase().includes(keywordLower)
    : false;
  const inH1 = pageData.headings
    .filter(h => h.level === 1)
    .some(h => h.text.toLowerCase().includes(keywordLower));

  let inUrl = false;
  try {
    const url = new URL(pageData.url);
    const urlText = (url.pathname + url.search).toLowerCase();
    inUrl = urlText.includes(keywordLower.replace(/\s+/g, '-')) ||
      urlText.includes(keywordLower.replace(/\s+/g, '_')) ||
      urlText.includes(keywordLower.replace(/\s+/g, ''));
  } catch {
    inUrl = false;
  }

  return {
    keyword,
    occurrences,
    density,
    inTitle,
    inDescription,
    inH1,
    inUrl,
  };
}

function calculateVerdict() {
  if (!pageData) return { label: 'Unknown', class: '', score: 0 };

  const scores = calculateAuditScores(currentKeyword || '');
  const score = scores.overall;

  let label;
  let cssClass;
  if (score >= 90) {
    label = 'Excellent';
    cssClass = 'excellent';
  } else if (score >= 70) {
    label = 'Good';
    cssClass = 'good';
  } else if (score >= 50) {
    label = 'Fair';
    cssClass = 'fair';
  } else if (score >= 30) {
    label = 'Needs Work';
    cssClass = 'needs-work';
  } else {
    label = 'Poor';
    cssClass = 'poor';
  }

  return { label, class: cssClass, score };
}

// Get top priority recommendation
function getTopPriorityFix() {
  if (!pageData) return null;

  // Priority order of issues to check
  const checks = [
    {
      condition: !pageData.title || pageData.title.length === 0,
      message: 'Your page is missing a title tag, which is critical for search visibility.'
    },
    {
      condition: !pageData.description || pageData.description.length === 0,
      message: 'Your page is missing a meta description. Search engines use this to show what your page is about.'
    },
    {
      condition: !pageData.headings.some(h => h.level === 1),
      message: 'Your page is missing an H1 heading, which helps search engines understand your main topic.'
    },
    {
      condition: pageData.title && pageData.title.length > 60,
      message: 'Your title tag is too long and may be truncated in search results.'
    },
    {
      condition: pageData.description && pageData.description.length > 160,
      message: 'Your meta description is too long and may be truncated in search results.'
    },
    {
      condition: pageData.description && pageData.description.length < 100,
      message: 'Your meta description is too short. Aim for 100-160 characters for best results.'
    },
    {
      condition: pageData.title && pageData.title.length < 30,
      message: 'Your title tag is too short. Aim for 30-60 characters for best results.'
    },
    {
      condition: pageData.wordCount < 300,
      message: 'Your page has thin content. Consider adding more valuable text to help with rankings.'
    },
    {
      condition: pageData.headings.filter(h => h.level === 1).length > 1,
      message: 'Your page has multiple H1 headings. Best practice is to have exactly one H1.'
    }
  ];

  for (const check of checks) {
    if (check.condition) {
      return check.message;
    }
  }

  return null; // All checks pass
}

// Get heading counts
function getHeadingCounts() {
  const counts = {};
  pageData?.headings.forEach(h => {
    counts[h.level] = (counts[h.level] || 0) + 1;
  });
  return counts;
}

// Show error state
function showError(message, details) {
  pageData = null;
  currentKeyword = '';

  const loadingState = document.getElementById('loading-state');
  const detailText = details || 'Try refreshing the page or opening a different website.';
  if (loadingState) {
    loadingState.classList.remove('hidden');
    loadingState.innerHTML = `
      <p style="color: var(--error)">${message}</p>
      <p style="color: var(--text-muted); margin-top: 8px; font-size: 12px;">
        ${detailText}
      </p>
    `;
  }

  document.getElementById('overview-content')?.classList.add('hidden');

  const listEl = document.getElementById('headings-list');
  if (listEl) {
    listEl.innerHTML = '<p class="empty-state">Page analysis is unavailable for this tab.</p>';
  }

  const pillsEl = document.getElementById('heading-pills');
  if (pillsEl) {
    pillsEl.innerHTML = '<span class="empty-state">No headings available.</span>';
  }

  const copyBtn = document.getElementById('copy-headings');
  if (copyBtn) {
    copyBtn.disabled = true;
    copyBtn.textContent = 'Copy all headings';
  }

  const keywordEmptyState = document.getElementById('keyword-empty-state');
  if (keywordEmptyState) {
    keywordEmptyState.textContent = 'Page analysis is unavailable for this tab.';
  }

  setKeywordResultsVisible(false);
  updateKeywordButtonState();
}

// Utility functions
function fallbackCopy(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (error) {
    console.warn('Fallback copy failed:', error);
    return false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRANSITION_WORDS = new Set([
  'additionally', 'also', 'besides', 'furthermore', 'moreover', 'however',
  'nevertheless', 'nonetheless', 'although', 'though', 'whereas', 'while',
  'therefore', 'consequently', 'thus', 'hence', 'accordingly', 'because',
  'since', 'meanwhile', 'finally', 'firstly', 'secondly', 'thirdly',
  'lastly', 'next', 'then', 'similarly', 'likewise', 'conversely',
  'instead', 'rather', 'otherwise', 'specifically', 'particularly',
  'especially', 'notably', 'indeed', 'certainly', 'undoubtedly',
  'for example', 'for instance', 'in addition', 'in contrast', 'on the other hand',
  'as a result', 'in conclusion', 'to summarize', 'in summary', 'in fact',
]);

function formatNumber(num) {
  return num.toLocaleString();
}

function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function getWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

function getSentences(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  return cleaned.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
}

function countSyllables(word) {
  let cleaned = word.toLowerCase().trim();
  if (cleaned.length <= 3) return 1;

  cleaned = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  cleaned = cleaned.replace(/^y/, '');

  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function calculateFleschScore(text) {
  const sentences = getSentences(text);
  const words = getWords(text);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasTransitionWord(sentence) {
  const lower = sentence.toLowerCase();
  for (const transition of TRANSITION_WORDS) {
    if (lower.includes(transition)) return true;
  }
  return false;
}

function analyzeReadability(text) {
  const sentences = getSentences(text);
  const words = getWords(text);
  const fleschScore = calculateFleschScore(text);
  const avgSentenceLength = sentences.length > 0
    ? Math.round((words.length / sentences.length) * 10) / 10
    : 0;
  const transitionSentences = sentences.filter(hasTransitionWord).length;
  const transitionPercent = sentences.length > 0
    ? Math.round((transitionSentences / sentences.length) * 100)
    : 0;

  return {
    fleschScore,
    avgSentenceLength,
    transitionPercent,
  };
}

function countKeywordOccurrences(text, keyword) {
  const escaped = escapeRegex(keyword.toLowerCase());
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function validateHierarchy(headings) {
  if (!headings || headings.length === 0) return true;

  let lastLevel = 0;
  for (const heading of headings) {
    if (lastLevel === 0) {
      if (heading.level > 2) {
        return false;
      }
      lastLevel = heading.level;
      continue;
    }

    if (heading.level > lastLevel + 1) {
      return false;
    }
    lastLevel = heading.level;
  }

  return true;
}
