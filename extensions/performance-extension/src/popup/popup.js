/**
 * OWSH Speed Audit - Performance Checker
 * Full analysis engine with 4-tab UI
 */

// State
let analysisResults = null;
let currentUrl = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
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

      const contentMap = {
        overview: 'overviewContent',
        resources: 'resourcesContent',
        images: 'imagesContent',
        loading: 'loadingContent'
      };
      document.getElementById(contentMap[tabName]).classList.remove('hidden');
    });
  });

  // Full Report button
  document.getElementById('fullReportBtn').addEventListener('click', () => {
    const url = `https://audit.owshsystems.com/performance?url=${encodeURIComponent(currentUrl)}`;
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
      await updateBadge(null);
      return;
    }

    currentUrl = tab.url;
    document.getElementById('currentUrl').textContent = currentUrl;
    document.getElementById('footerLink').href = `https://audit.owshsystems.com/performance?url=${encodeURIComponent(currentUrl)}`;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: analyzePagePerformance
    });

    if (!results || !results[0] || !results[0].result) {
      showError('Analysis failed', 'Try refreshing the page.');
      return;
    }

    analysisResults = results[0].result;

    const score = calculateOverallScore(analysisResults);
    analysisResults.score = score;
    await updateBadge(score);

    renderOverview();
    renderResources();
    renderImages();
    renderLoading();

    hideLoading();
    document.getElementById('overviewContent').classList.remove('hidden');

  } catch (error) {
    console.error('Analysis error:', error);
    showError('Analysis failed', error.message || 'An unexpected error occurred.');
  }
}

// ──────────────────────────────────────────────
// Page Analysis Function (Injected into page)
// ──────────────────────────────────────────────
async function analyzePagePerformance() {
  const results = {
    coreWebVitals: { lcp: null, cls: null, inp: null, fcp: null, ttfb: null, tbt: null },
    navigation: { dns: 0, connect: 0, ttfb: 0, download: 0, domProcessing: 0, totalLoad: 0, protocol: '' },
    resources: [],
    resourceSummary: {
      scripts: { count: 0, size: 0 },
      stylesheets: { count: 0, size: 0 },
      images: { count: 0, size: 0 },
      fonts: { count: 0, size: 0 },
      other: { count: 0, size: 0 },
      total: { count: 0, size: 0 }
    },
    renderBlocking: [],
    thirdParty: { count: 0, size: 0 },
    firstParty: { count: 0, size: 0 },
    imageIssues: {
      oversized: [],
      missingLazy: [],
      missingDimensions: [],
      couldBeModern: [],
      totalWeight: 0,
      totalWeightFromResources: 0,
      pageWeight: 0
    },
    longTasks: [],
    fonts: [],
    inlineStats: { scriptSize: 0, scriptCount: 0, styleSize: 0, styleCount: 0 },
    domNodes: 0,
    connectionInfo: { protocol: '', effectiveType: '' },
    loadTimeline: { dns: 0, connect: 0, ttfb: 0, download: 0, domProcessing: 0, total: 0 },
    issues: []
  };

  // ── Helper: get hostname ──
  const pageHost = location.hostname;

  function getShortName(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.split('/').pop() || u.pathname;
      return path.length > 40 ? path.substring(0, 37) + '...' : path;
    } catch {
      return url.substring(0, 40);
    }
  }

  function isThirdParty(url) {
    try {
      return new URL(url).hostname !== pageHost;
    } catch {
      return false;
    }
  }

  function getResourceType(entry) {
    const type = entry.initiatorType || '';
    if (type === 'script' || entry.name.match(/\.js(\?|$)/i)) return 'script';
    if (type === 'css' || type === 'link' || entry.name.match(/\.css(\?|$)/i)) return 'stylesheet';
    if (type === 'img' || entry.name.match(/\.(png|jpg|jpeg|gif|svg|webp|avif|ico)(\?|$)/i)) return 'image';
    if (entry.name.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i)) return 'font';
    return 'other';
  }

  // ── Core Web Vitals (via PerformanceObserver with buffered:true) ──
  // When there are zero buffered entries, the observer callback never fires.
  // defaultOnTimeout lets us handle this: CLS defaults to 0 (no shifts = perfect),
  // while LCP/INP default to null (genuinely no data).
  function observeMetric(type, extract, timeout = 500, defaultOnTimeout = null) {
    return new Promise(resolve => {
      try {
        let resolved = false;
        const observer = new PerformanceObserver(list => {
          if (resolved) return;
          const value = extract(list.getEntries());
          if (value !== null) {
            resolved = true;
            observer.disconnect();
            resolve(value);
          }
        });
        observer.observe({ type, buffered: true });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
            resolve(defaultOnTimeout);
          }
        }, timeout);
      } catch (e) { resolve(defaultOnTimeout !== null ? defaultOnTimeout : null); }
    });
  }

  const [lcpVal, clsVal, inpVal] = await Promise.all([
    // LCP: null if no entries (genuinely unknown)
    observeMetric('largest-contentful-paint', entries => {
      if (entries.length === 0) return null;
      return entries[entries.length - 1].startTime;
    }, 500, null),
    // CLS: 0 if no entries (no layout shifts = perfect score)
    observeMetric('layout-shift', entries => {
      let cls = 0;
      entries.forEach(e => { if (!e.hadRecentInput) cls += e.value; });
      return cls;
    }, 500, 0),
    // INP: null if no entries (requires user interaction to measure)
    observeMetric('event', entries => {
      if (entries.length === 0) return null;
      let max = 0;
      entries.forEach(e => { if (e.duration > max) max = e.duration; });
      return max > 0 ? max : null;
    }, 1000, null)
  ]);

  results.coreWebVitals.lcp = lcpVal;
  results.coreWebVitals.cls = clsVal;
  results.coreWebVitals.inp = inpVal;

  // ── FCP (from paint entries) ──
  try {
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
    if (fcpEntry) results.coreWebVitals.fcp = fcpEntry.startTime;
  } catch (e) { /* FCP not available */ }

  // ── Navigation Timing ──
  try {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      const nav = navEntries[0];
      results.navigation.dns = Math.max(0, nav.domainLookupEnd - nav.domainLookupStart);
      results.navigation.connect = Math.max(0, nav.connectEnd - nav.connectStart);
      results.navigation.ttfb = Math.max(0, nav.responseStart - nav.requestStart);
      results.navigation.download = Math.max(0, nav.responseEnd - nav.responseStart);
      results.navigation.domProcessing = Math.max(0, nav.domComplete - nav.responseEnd);
      results.navigation.totalLoad = Math.max(0, nav.loadEventEnd - nav.startTime);
      results.navigation.protocol = nav.nextHopProtocol || '';

      results.loadTimeline.dns = results.navigation.dns;
      results.loadTimeline.connect = results.navigation.connect;
      results.loadTimeline.ttfb = results.navigation.ttfb;
      results.loadTimeline.download = results.navigation.download;
      results.loadTimeline.domProcessing = results.navigation.domProcessing;
      results.loadTimeline.total = results.navigation.totalLoad;

      // TTFB as CWV metric (responseStart relative to page start)
      results.coreWebVitals.ttfb = Math.max(0, nav.responseStart - nav.startTime);
    }
  } catch (e) { /* Navigation timing not available */ }

  // ── TBT (sum of blocking time from long tasks) ──
  try {
    const longTaskEntries = performance.getEntriesByType('longtask');
    let tbt = 0;
    longTaskEntries.forEach(task => {
      if (task.duration > 50) tbt += task.duration - 50;
    });
    results.coreWebVitals.tbt = tbt;
  } catch (e) { results.coreWebVitals.tbt = 0; }

  // ── Resources ──
  try {
    const resourceEntries = performance.getEntriesByType('resource');
    let totalSize = 0;

    resourceEntries.forEach(entry => {
      const size = entry.transferSize || entry.encodedBodySize || 0;
      const type = getResourceType(entry);
      const thirdParty = isThirdParty(entry.name);
      const name = getShortName(entry.name);

      const resource = {
        name,
        fullUrl: entry.name,
        type,
        size,
        duration: Math.round(entry.duration),
        startTime: Math.round(entry.startTime),
        isThirdParty: thirdParty
      };
      results.resources.push(resource);

      // Summary by type
      const typeMap = {
        script: 'scripts',
        stylesheet: 'stylesheets',
        image: 'images',
        font: 'fonts',
        other: 'other'
      };
      const summaryKey = typeMap[type] || 'other';
      results.resourceSummary[summaryKey].count++;
      results.resourceSummary[summaryKey].size += size;
      results.resourceSummary.total.count++;
      results.resourceSummary.total.size += size;
      totalSize += size;

      // First/Third party
      if (thirdParty) {
        results.thirdParty.count++;
        results.thirdParty.size += size;
      } else {
        results.firstParty.count++;
        results.firstParty.size += size;
      }
    });

    results.imageIssues.pageWeight = totalSize;
  } catch (e) { /* Resource timing not available */ }

  // ── Render-Blocking Resources ──
  try {
    // Check for render-blocking stylesheets
    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (!link.hasAttribute('media') || link.getAttribute('media') === 'all')) {
        if (!link.hasAttribute('disabled')) {
          results.renderBlocking.push({
            type: 'CSS',
            url: href,
            name: getShortName(href)
          });
        }
      }
    });

    // Check for render-blocking scripts in <head>
    const headScripts = document.head.querySelectorAll('script[src]');
    headScripts.forEach(script => {
      if (!script.hasAttribute('async') && !script.hasAttribute('defer') && (!script.hasAttribute('type') || script.getAttribute('type') === 'text/javascript')) {
        const src = script.getAttribute('src');
        if (src) {
          results.renderBlocking.push({
            type: 'JS',
            url: src,
            name: getShortName(src)
          });
        }
      }
    });
  } catch (e) { /* Render-blocking detection failed */ }

  // ── Image Issues ──
  try {
    const images = document.querySelectorAll('img');
    let imageWeight = 0;

    images.forEach(img => {
      const src = img.currentSrc || img.src || '';
      if (!src || src.startsWith('data:')) return;
      const name = getShortName(src);

      // Check resource entry for size
      const resourceEntry = results.resources.find(r => r.fullUrl === src || src.includes(r.name));
      const size = resourceEntry ? resourceEntry.size : 0;
      imageWeight += size;

      // Oversized: rendered much smaller than natural (only flag if > 8KB)
      const naturalW = img.naturalWidth || 0;
      const naturalH = img.naturalHeight || 0;
      const renderedW = img.clientWidth || img.offsetWidth || 0;
      const renderedH = img.clientHeight || img.offsetHeight || 0;

      if (size > 8192 && naturalW > 0 && renderedW > 0 && naturalW > renderedW * 2 && naturalH > renderedH * 2) {
        results.imageIssues.oversized.push({
          name,
          url: src,
          natural: `${naturalW}x${naturalH}`,
          rendered: `${renderedW}x${renderedH}`,
          savings: `${Math.round((1 - (renderedW * renderedH) / (naturalW * naturalH)) * 100)}%`
        });
      }

      // Missing lazy loading (only flag images > 5KB well below fold)
      const rect = img.getBoundingClientRect();
      if (size > 5120 && rect.top > window.innerHeight * 1.5 && !img.hasAttribute('loading')) {
        results.imageIssues.missingLazy.push({ name, url: src });
      }

      // Missing dimensions (only flag visible images > 50px)
      if (renderedW > 50 && renderedH > 50 && !img.hasAttribute('width') && !img.hasAttribute('height') && !img.style.width && !img.style.height) {
        results.imageIssues.missingDimensions.push({ name, url: src });
      }

      // Legacy format (only flag images > 8KB where conversion would save meaningful bytes)
      const ext = src.split('?')[0].split('.').pop().toLowerCase();
      if (size > 8192 && ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) {
        results.imageIssues.couldBeModern.push({
          name,
          url: src,
          format: ext.toUpperCase(),
          suggestion: 'WebP/AVIF'
        });
      }
    });

    results.imageIssues.totalWeight = imageWeight;

    // Also set image weight from resource summary (more complete — includes CSS backgrounds, favicons, etc.)
    results.imageIssues.totalWeightFromResources = results.resourceSummary.images.size;
  } catch (e) { /* Image analysis failed */ }

  // ── Long Tasks ──
  try {
    const longTasks = performance.getEntriesByType('longtask');
    longTasks.forEach(task => {
      results.longTasks.push({
        duration: Math.round(task.duration),
        startTime: Math.round(task.startTime)
      });
    });
  } catch (e) { /* Long tasks API not available */ }

  // ── Font Analysis ──
  try {
    if (document.fonts) {
      document.fonts.forEach(font => {
        results.fonts.push({
          family: font.family.replace(/['"]/g, ''),
          status: font.status,
          display: font.display || 'auto'
        });
      });
    }
  } catch (e) { /* Font API not available */ }

  // ── Inline Resources ──
  try {
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach(script => {
      const content = script.textContent || '';
      if (content.trim().length > 0) {
        results.inlineStats.scriptCount++;
        results.inlineStats.scriptSize += new Blob([content]).size;
      }
    });

    const inlineStyles = document.querySelectorAll('style');
    inlineStyles.forEach(style => {
      const content = style.textContent || '';
      if (content.trim().length > 0) {
        results.inlineStats.styleCount++;
        results.inlineStats.styleSize += new Blob([content]).size;
      }
    });
  } catch (e) { /* Inline stats failed */ }

  // ── DOM Nodes ──
  results.domNodes = document.querySelectorAll('*').length;

  // ── Connection Info ──
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    results.connectionInfo.protocol = nav ? (nav.nextHopProtocol || '') : '';

    if (navigator.connection) {
      results.connectionInfo.effectiveType = navigator.connection.effectiveType || '';
    }
  } catch (e) { /* Connection info not available */ }

  // ── Generate Issues ──
  const { coreWebVitals, resourceSummary, renderBlocking, imageIssues, longTasks, domNodes } = results;

  // CWV issues
  if (coreWebVitals.lcp !== null && coreWebVitals.lcp > 4000) {
    results.issues.push({ severity: 'critical', title: `Slow LCP: ${(coreWebVitals.lcp / 1000).toFixed(1)}s (target: <2.5s)`, category: 'cwv' });
  } else if (coreWebVitals.lcp !== null && coreWebVitals.lcp > 2500) {
    results.issues.push({ severity: 'serious', title: `LCP needs improvement: ${(coreWebVitals.lcp / 1000).toFixed(1)}s (target: <2.5s)`, category: 'cwv' });
  }

  if (coreWebVitals.cls !== null && coreWebVitals.cls > 0.25) {
    results.issues.push({ severity: 'critical', title: `High CLS: ${coreWebVitals.cls.toFixed(3)} (target: <0.1)`, category: 'cwv' });
  } else if (coreWebVitals.cls !== null && coreWebVitals.cls > 0.1) {
    results.issues.push({ severity: 'serious', title: `CLS needs improvement: ${coreWebVitals.cls.toFixed(3)} (target: <0.1)`, category: 'cwv' });
  }

  if (coreWebVitals.inp !== null && coreWebVitals.inp > 500) {
    results.issues.push({ severity: 'critical', title: `Slow INP: ${coreWebVitals.inp}ms (target: <200ms)`, category: 'cwv' });
  } else if (coreWebVitals.inp !== null && coreWebVitals.inp > 200) {
    results.issues.push({ severity: 'serious', title: `INP needs improvement: ${coreWebVitals.inp}ms (target: <200ms)`, category: 'cwv' });
  }

  // Page weight issues
  const totalSizeMB = resourceSummary.total.size / (1024 * 1024);
  if (totalSizeMB > 5) {
    results.issues.push({ severity: 'critical', title: `Very heavy page: ${totalSizeMB.toFixed(1)}MB (target: <1.5MB)`, category: 'weight' });
  } else if (totalSizeMB > 3) {
    results.issues.push({ severity: 'serious', title: `Heavy page: ${totalSizeMB.toFixed(1)}MB (target: <1.5MB)`, category: 'weight' });
  } else if (totalSizeMB > 1.5) {
    results.issues.push({ severity: 'moderate', title: `Page weight above target: ${totalSizeMB.toFixed(1)}MB (target: <1.5MB)`, category: 'weight' });
  }

  if (resourceSummary.total.count > 100) {
    results.issues.push({ severity: 'critical', title: `Too many requests: ${resourceSummary.total.count} (target: <40)`, category: 'weight' });
  } else if (resourceSummary.total.count > 60) {
    results.issues.push({ severity: 'serious', title: `Many requests: ${resourceSummary.total.count} (target: <40)`, category: 'weight' });
  } else if (resourceSummary.total.count > 40) {
    results.issues.push({ severity: 'moderate', title: `Request count above target: ${resourceSummary.total.count} (target: <40)`, category: 'weight' });
  }

  // Resource optimization issues
  if (renderBlocking.length > 5) {
    results.issues.push({ severity: 'critical', title: `${renderBlocking.length} render-blocking resources`, category: 'resources' });
  } else if (renderBlocking.length > 2) {
    results.issues.push({ severity: 'serious', title: `${renderBlocking.length} render-blocking resources`, category: 'resources' });
  } else if (renderBlocking.length > 0) {
    results.issues.push({ severity: 'moderate', title: `${renderBlocking.length} render-blocking resource${renderBlocking.length > 1 ? 's' : ''}`, category: 'resources' });
  }

  const totalResources = results.thirdParty.count + results.firstParty.count;
  const thirdPartyRatio = totalResources > 0 ? results.thirdParty.count / totalResources : 0;
  if (thirdPartyRatio > 0.5) {
    results.issues.push({ severity: 'serious', title: `${Math.round(thirdPartyRatio * 100)}% third-party resources`, category: 'resources' });
  }

  if (longTasks.length > 3) {
    results.issues.push({ severity: 'critical', title: `${longTasks.length} long tasks detected (>50ms)`, category: 'resources' });
  } else if (longTasks.length > 0) {
    results.issues.push({ severity: 'moderate', title: `${longTasks.length} long task${longTasks.length > 1 ? 's' : ''} detected`, category: 'resources' });
  }

  // Image optimization issues
  if (imageIssues.oversized.length > 0) {
    results.issues.push({ severity: 'serious', title: `${imageIssues.oversized.length} oversized image${imageIssues.oversized.length > 1 ? 's' : ''}`, category: 'images' });
  }

  if (imageIssues.couldBeModern.length > 3) {
    results.issues.push({ severity: 'serious', title: `${imageIssues.couldBeModern.length} images could use modern formats (WebP/AVIF)`, category: 'images' });
  } else if (imageIssues.couldBeModern.length > 0) {
    results.issues.push({ severity: 'moderate', title: `${imageIssues.couldBeModern.length} image${imageIssues.couldBeModern.length > 1 ? 's' : ''} could use modern formats`, category: 'images' });
  }

  if (imageIssues.missingLazy.length > 0) {
    results.issues.push({ severity: 'moderate', title: `${imageIssues.missingLazy.length} below-fold image${imageIssues.missingLazy.length > 1 ? 's' : ''} missing lazy loading`, category: 'images' });
  }

  if (imageIssues.missingDimensions.length > 3) {
    results.issues.push({ severity: 'serious', title: `${imageIssues.missingDimensions.length} images missing width/height (causes CLS)`, category: 'images' });
  } else if (imageIssues.missingDimensions.length > 0) {
    results.issues.push({ severity: 'moderate', title: `${imageIssues.missingDimensions.length} image${imageIssues.missingDimensions.length > 1 ? 's' : ''} missing dimensions`, category: 'images' });
  }

  // DOM size
  if (domNodes > 3000) {
    results.issues.push({ severity: 'serious', title: `Large DOM: ${domNodes.toLocaleString()} nodes (target: <1,500)`, category: 'weight' });
  } else if (domNodes > 1500) {
    results.issues.push({ severity: 'moderate', title: `DOM size above target: ${domNodes.toLocaleString()} nodes`, category: 'weight' });
  }

  return results;
}

// ──────────────────────────────────────────────
// Scoring Algorithm
// ──────────────────────────────────────────────
function calculateOverallScore(data) {
  let cwvScore = 100;
  let weightScore = 100;
  let resourceScore = 100;
  let imageScore = 100;

  // CWV scoring (35%)
  const { coreWebVitals } = data;
  let cwvFactors = 0;
  let cwvPenalties = 0;

  if (coreWebVitals.lcp !== null) {
    cwvFactors++;
    if (coreWebVitals.lcp > 4000) cwvPenalties += 100;
    else if (coreWebVitals.lcp > 2500) cwvPenalties += 50;
    else cwvPenalties += Math.max(0, (coreWebVitals.lcp - 1000) / 1500 * 25);
  }

  if (coreWebVitals.cls !== null) {
    cwvFactors++;
    if (coreWebVitals.cls > 0.25) cwvPenalties += 100;
    else if (coreWebVitals.cls > 0.1) cwvPenalties += 50;
    else cwvPenalties += Math.max(0, coreWebVitals.cls / 0.1 * 25);
  }

  if (coreWebVitals.inp !== null) {
    cwvFactors++;
    if (coreWebVitals.inp > 500) cwvPenalties += 100;
    else if (coreWebVitals.inp > 200) cwvPenalties += 50;
    else cwvPenalties += Math.max(0, coreWebVitals.inp / 200 * 25);
  }

  if (cwvFactors > 0) {
    cwvScore = Math.max(0, 100 - (cwvPenalties / cwvFactors));
  }

  // Page Weight scoring (25%)
  const totalSizeMB = data.resourceSummary.total.size / (1024 * 1024);
  const requestCount = data.resourceSummary.total.count;

  if (totalSizeMB > 5) weightScore -= 60;
  else if (totalSizeMB > 3) weightScore -= 40;
  else if (totalSizeMB > 1.5) weightScore -= 20;

  if (requestCount > 100) weightScore -= 40;
  else if (requestCount > 60) weightScore -= 25;
  else if (requestCount > 40) weightScore -= 10;

  weightScore = Math.max(0, weightScore);

  // Resource Optimization scoring (20%)
  const blockingCount = data.renderBlocking.length;
  if (blockingCount > 5) resourceScore -= 40;
  else if (blockingCount > 2) resourceScore -= 25;
  else if (blockingCount > 0) resourceScore -= 10;

  const totalRes = data.thirdParty.count + data.firstParty.count;
  const tpRatio = totalRes > 0 ? data.thirdParty.count / totalRes : 0;
  if (tpRatio > 0.5) resourceScore -= 20;
  else if (tpRatio > 0.3) resourceScore -= 10;

  if (data.longTasks.length > 3) resourceScore -= 30;
  else if (data.longTasks.length > 0) resourceScore -= 10;

  resourceScore = Math.max(0, resourceScore);

  // Image Optimization scoring (20%)
  const imgIssues = data.imageIssues;
  if (imgIssues.oversized.length > 3) imageScore -= 30;
  else if (imgIssues.oversized.length > 0) imageScore -= 15;

  if (imgIssues.couldBeModern.length > 5) imageScore -= 25;
  else if (imgIssues.couldBeModern.length > 0) imageScore -= 10;

  if (imgIssues.missingLazy.length > 3) imageScore -= 20;
  else if (imgIssues.missingLazy.length > 0) imageScore -= 10;

  if (imgIssues.missingDimensions.length > 3) imageScore -= 25;
  else if (imgIssues.missingDimensions.length > 0) imageScore -= 10;

  imageScore = Math.max(0, imageScore);

  // Weighted total
  const total = Math.round(
    cwvScore * 0.35 +
    weightScore * 0.25 +
    resourceScore * 0.20 +
    imageScore * 0.20
  );

  return Math.max(0, Math.min(100, total));
}

function getVerdict(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Needs Work';
  return 'Poor';
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ──────────────────────────────────────────────
// Fix Tips (beginner-friendly suggestions per issue)
// ──────────────────────────────────────────────
function getIssueTip(title, category) {
  // CWV tips
  if (title.includes('LCP')) return 'Optimize your largest image or text block. Compress images, use modern formats (WebP), and preload critical resources.';
  if (title.includes('CLS')) return 'Add width and height to all images and embeds. Avoid inserting content above existing content after the page loads.';
  if (title.includes('INP')) return 'Break up long JavaScript tasks. Reduce third-party scripts and ensure click handlers respond quickly.';

  // Weight tips
  if (category === 'weight' && title.includes('heavy')) return 'Compress images, remove unused code, and enable server-side compression (gzip/Brotli). A CDN like Cloudflare helps too.';
  if (category === 'weight' && title.includes('request')) return 'Combine small files where possible. Remove unused plugins, fonts, and scripts. Each request adds loading delay.';
  if (category === 'weight' && title.includes('DOM')) return 'Simplify your page structure. Remove unnecessary HTML elements and avoid deeply nested layouts.';

  // Resource tips
  if (title.includes('render-blocking')) return 'Move non-essential CSS and JavaScript to load after the page content. Add "async" or "defer" to script tags.';
  if (title.includes('third-party')) return 'Review all third-party scripts (analytics, chat widgets, ads) and remove ones you don\'t actively use.';
  if (title.includes('long task')) return 'Break up heavy JavaScript processing. Delay non-essential scripts until after the page is interactive.';

  // Image tips
  if (category === 'images' && title.includes('oversized')) return 'Resize images to match their display size. A phone doesn\'t need a 4000px image — 800px looks the same.';
  if (category === 'images' && title.includes('modern')) return 'Convert images to WebP or AVIF format. They\'re 25-50% smaller with the same quality.';
  if (category === 'images' && title.includes('lazy')) return 'Add loading="lazy" to images below the fold so they only load when scrolled into view.';
  if (category === 'images' && title.includes('dimension')) return 'Add width and height attributes to every image tag to prevent layout shifts.';

  return '';
}

// ──────────────────────────────────────────────
// Render: Overview Tab
// ──────────────────────────────────────────────
function renderOverview() {
  if (!analysisResults) return;
  const { score, coreWebVitals, loadTimeline, issues, resourceSummary, domNodes } = analysisResults;

  // Score card
  document.getElementById('scoreNumber').textContent = score;
  document.getElementById('scoreGrade').textContent = getGrade(score);
  document.getElementById('scoreVerdict').textContent = getVerdict(score);

  const scoreCard = document.getElementById('scoreCard');
  scoreCard.className = 'score-card';
  if (score >= 90) scoreCard.classList.add('excellent');
  else if (score >= 70) scoreCard.classList.add('good');
  else if (score >= 50) scoreCard.classList.add('fair');
  else if (score >= 30) scoreCard.classList.add('poor');
  else scoreCard.classList.add('fail');

  // CWV cards (5 metrics — INP excluded since it requires user interaction before analysis)
  renderCWVCard('lcpCard', 'lcpValue', coreWebVitals.lcp, 'lcp');
  renderCWVCard('clsCard', 'clsValue', coreWebVitals.cls, 'cls');
  renderCWVCard('fcpCard', 'fcpValue', coreWebVitals.fcp, 'fcp');
  renderCWVCard('ttfbCard', 'ttfbValue', coreWebVitals.ttfb, 'ttfb');
  renderCWVCard('tbtCard', 'tbtValue', coreWebVitals.tbt, 'tbt');

  // Timeline
  renderTimeline(loadTimeline);

  // Top issues
  const topIssues = issues.slice(0, 5);
  const topIssuesList = document.getElementById('topIssuesList');
  if (topIssues.length === 0) {
    topIssuesList.innerHTML = '<p class="empty-state">No performance issues detected!</p>';
  } else {
    topIssuesList.innerHTML = topIssues.map(issue => {
      const tip = getIssueTip(issue.title, issue.category);
      return `
        <div class="top-issue-item ${issue.severity}">
          <div class="issue-indicator"></div>
          <div class="issue-info">
            <div class="issue-title">${escapeHtml(issue.title)}</div>
            <div class="issue-meta">${issue.category || 'General'}</div>
            ${tip ? `<div class="issue-tip">${escapeHtml(tip)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Stats
  document.getElementById('totalRequests').textContent = resourceSummary.total.count;
  document.getElementById('pageWeight').textContent = formatBytes(resourceSummary.total.size);
  document.getElementById('loadTime').textContent = formatTime(analysisResults.navigation.totalLoad);
  document.getElementById('domNodes').textContent = domNodes > 999 ? (domNodes / 1000).toFixed(1) + 'K' : domNodes;
}

function renderCWVCard(cardId, valueId, value, type) {
  const card = document.getElementById(cardId);
  const valueEl = document.getElementById(valueId);

  if (value === null) {
    valueEl.textContent = 'N/A';
    card.className = 'cwv-card na';
    return;
  }

  let status = 'good';
  let displayValue = '';

  if (type === 'lcp') {
    displayValue = (value / 1000).toFixed(1) + 's';
    if (value > 4000) status = 'poor';
    else if (value > 2500) status = 'needs-improvement';
  } else if (type === 'cls') {
    displayValue = value.toFixed(3);
    if (value > 0.25) status = 'poor';
    else if (value > 0.1) status = 'needs-improvement';
  } else if (type === 'inp') {
    displayValue = Math.round(value) + 'ms';
    if (value > 500) status = 'poor';
    else if (value > 200) status = 'needs-improvement';
  } else if (type === 'fcp') {
    displayValue = (value / 1000).toFixed(1) + 's';
    if (value > 3000) status = 'poor';
    else if (value > 1800) status = 'needs-improvement';
  } else if (type === 'ttfb') {
    displayValue = value >= 1000 ? (value / 1000).toFixed(1) + 's' : Math.round(value) + 'ms';
    if (value > 1800) status = 'poor';
    else if (value > 800) status = 'needs-improvement';
  } else if (type === 'tbt') {
    displayValue = value >= 1000 ? (value / 1000).toFixed(1) + 's' : Math.round(value) + 'ms';
    if (value > 600) status = 'poor';
    else if (value > 200) status = 'needs-improvement';
  }

  valueEl.textContent = displayValue;
  card.className = 'cwv-card ' + status;
}

function renderTimeline(timeline) {
  const bar = document.getElementById('timelineBar');
  const labels = document.getElementById('timelineLabels');
  const total = timeline.total || 1;

  const segments = [
    { key: 'dns', label: 'DNS', value: timeline.dns },
    { key: 'connect', label: 'Connect', value: timeline.connect },
    { key: 'ttfb', label: 'TTFB', value: timeline.ttfb },
    { key: 'download', label: 'Download', value: timeline.download },
    { key: 'dom', label: 'DOM', value: timeline.domProcessing }
  ];

  if (total <= 0) {
    bar.innerHTML = '<div class="timeline-segment dom" style="width:100%">No data</div>';
    labels.innerHTML = '';
    return;
  }

  bar.innerHTML = segments.map(s => {
    const pct = Math.max((s.value / total) * 100, 0);
    if (pct < 1) return '';
    return `<div class="timeline-segment ${s.key}" style="width:${pct}%" title="${s.label}: ${formatTime(s.value)}">${pct > 12 ? formatTime(s.value) : ''}</div>`;
  }).join('');

  labels.innerHTML = segments.map(s => `
    <div class="timeline-label">
      <div class="timeline-dot ${s.key}"></div>
      <span>${s.label}: ${formatTime(s.value)}</span>
    </div>
  `).join('');
}

// ──────────────────────────────────────────────
// Render: Resources Tab
// ──────────────────────────────────────────────
function renderResources() {
  if (!analysisResults) return;
  const { resourceSummary, resources, thirdParty, firstParty, renderBlocking } = analysisResults;

  // Type breakdown
  const breakdown = document.getElementById('typeBreakdown');
  const types = [
    { key: 'scripts', label: 'Scripts', data: resourceSummary.scripts },
    { key: 'stylesheets', label: 'Stylesheets', data: resourceSummary.stylesheets },
    { key: 'images', label: 'Images', data: resourceSummary.images },
    { key: 'fonts', label: 'Fonts', data: resourceSummary.fonts },
    { key: 'other', label: 'Other', data: resourceSummary.other }
  ];

  const maxSize = Math.max(...types.map(t => t.data.size), 1);

  breakdown.innerHTML = types.map(t => `
    <div class="resource-group">
      <div class="resource-group-header">
        <span class="resource-group-name">${t.label}</span>
        <span class="resource-group-meta">${t.data.count} files - ${formatBytes(t.data.size)}</span>
      </div>
      <div class="resource-bar">
        <div class="resource-bar-fill ${t.key}" style="width:${(t.data.size / maxSize) * 100}%"></div>
      </div>
    </div>
  `).join('');

  // Top resources (largest first)
  const topResources = [...resources]
    .filter(r => r.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  const topList = document.getElementById('topResourcesList');
  if (topResources.length === 0) {
    topList.innerHTML = '<p class="empty-state">No resource size data available</p>';
  } else {
    topList.innerHTML = topResources.map(r => `
      <div class="resource-item" title="${escapeHtml(r.fullUrl)}">
        <span class="resource-type-badge ${r.type}">${r.type === 'stylesheet' ? 'CSS' : r.type.substring(0, 5).toUpperCase()}</span>
        <span class="resource-name">${escapeHtml(r.name)}</span>
        <span class="resource-size">${formatBytes(r.size)}</span>
      </div>
    `).join('');
  }

  // Party split
  const partySplit = document.getElementById('partySplit');
  const totalParty = firstParty.count + thirdParty.count;

  if (totalParty === 0) {
    partySplit.innerHTML = '<p class="empty-state">No resource data available</p>';
  } else {
    const fpPct = Math.round((firstParty.count / totalParty) * 100);
    const tpPct = 100 - fpPct;

    partySplit.innerHTML = `
      <div class="party-split-bar">
        <div class="party-segment first-party" style="width:${fpPct}%">${fpPct > 15 ? fpPct + '%' : ''}</div>
        <div class="party-segment third-party" style="width:${tpPct}%">${tpPct > 15 ? tpPct + '%' : ''}</div>
      </div>
      <div class="party-details">
        <div class="party-label"><div class="party-dot first"></div>First party: ${firstParty.count} (${formatBytes(firstParty.size)})</div>
        <div class="party-label"><div class="party-dot third"></div>Third party: ${thirdParty.count} (${formatBytes(thirdParty.size)})</div>
      </div>
    `;
  }

  // Render blocking
  const blockingList = document.getElementById('renderBlockingList');
  if (renderBlocking.length === 0) {
    blockingList.innerHTML = '<p class="empty-state">No render-blocking resources detected</p>';
  } else {
    blockingList.innerHTML = renderBlocking.map(r => `
      <div class="blocking-item">
        <div class="blocking-icon">!</div>
        <span class="blocking-name" title="${escapeHtml(r.url)}">${escapeHtml(r.name)}</span>
        <span class="blocking-type">${r.type}</span>
      </div>
    `).join('');
  }
}

// ──────────────────────────────────────────────
// Render: Images Tab
// ──────────────────────────────────────────────
function renderImages() {
  if (!analysisResults) return;
  const { imageIssues, resourceSummary } = analysisResults;

  // Image weight display
  const weightRatio = document.getElementById('imageWeightRatio');
  const imgWeight = imageIssues.totalWeightFromResources || imageIssues.totalWeight;
  const imgCount = resourceSummary.images.count;

  // Classify by absolute weight (percentage is unreliable — Performance API undercounts total)
  let barClass = '';
  let weightLabel = 'Lightweight';
  if (imgWeight > 1024 * 1024) { barClass = 'excessive'; weightLabel = 'Heavy'; }
  else if (imgWeight > 500 * 1024) { barClass = 'heavy'; weightLabel = 'Moderate'; }

  // Show bar relative to 2MB target (a reasonable image budget)
  const barPct = Math.min(Math.round((imgWeight / (2 * 1024 * 1024)) * 100), 100);

  weightRatio.innerHTML = `
    <div class="weight-bar-container">
      <div class="weight-bar-label">
        <span>${formatBytes(imgWeight)} across ${imgCount} image${imgCount !== 1 ? 's' : ''}</span>
        <span>${weightLabel}</span>
      </div>
      <div class="weight-bar">
        <div class="weight-bar-fill ${barClass}" style="width:${barPct}%"></div>
      </div>
    </div>
  `;

  // Oversized images
  renderImageIssueList('oversizedList', imageIssues.oversized, 'No oversized images found',
    item => `${item.natural} served at ${item.rendered} (${item.savings} savings possible)`,
    'Resize these images to match their display size — they\'re much larger than needed.');

  // Missing lazy loading
  renderImageIssueList('missingLazyList', imageIssues.missingLazy, 'All below-fold images use lazy loading',
    () => 'Below fold, no loading="lazy"',
    'Add loading="lazy" to these image tags so they only load when scrolled into view.');

  // Legacy formats
  renderImageIssueList('legacyFormatList', imageIssues.couldBeModern, 'All images use modern formats',
    item => `${item.format} - could be ${item.suggestion}`,
    'Convert these to WebP or AVIF format for 25-50% size savings with no quality loss.');

  // Missing dimensions
  renderImageIssueList('missingDimensionsList', imageIssues.missingDimensions, 'All images have width/height attributes',
    () => 'No width/height attributes (causes CLS)',
    'Add width and height attributes to prevent the page from jumping as these load.');
}

function renderImageIssueList(containerId, items, emptyText, detailFn, sectionTip) {
  const container = document.getElementById(containerId);
  if (items.length === 0) {
    container.innerHTML = `<p class="empty-state">${emptyText}</p>`;
  } else {
    container.innerHTML = (sectionTip ? `<p class="section-tip">${sectionTip}</p>` : '') + items.slice(0, 10).map(item => `
      <div class="image-issue-item" title="${escapeHtml(item.url || '')}"${item.url ? ` data-img-url="${escapeHtml(item.url)}"` : ''}>
        <img src="${escapeHtml(item.url || '')}" class="image-issue-thumb" onerror="this.style.display='none'" alt="" />
        <span class="image-issue-name">${escapeHtml(item.name)}</span>
        <span class="image-issue-detail">${detailFn(item)}</span>
      </div>
    `).join('');

    // Add click-to-highlight handlers
    container.querySelectorAll('.image-issue-item[data-img-url]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const imgUrl = el.dataset.imgUrl;
        if (imgUrl) highlightImageOnPage(imgUrl);
      });
    });
  }
}

// ──────────────────────────────────────────────
// Render: Loading Tab
// ──────────────────────────────────────────────
function renderLoading() {
  if (!analysisResults) return;
  const { resources, longTasks, fonts, inlineStats, connectionInfo } = analysisResults;

  // Waterfall
  const waterfallList = document.getElementById('waterfallList');
  const waterfallResources = [...resources]
    .filter(r => r.duration > 0)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 30);

  if (waterfallResources.length === 0) {
    waterfallList.innerHTML = '<p class="empty-state">No resource timing data available</p>';
  } else {
    const maxEnd = Math.max(...waterfallResources.map(r => r.startTime + r.duration), 1);

    waterfallList.innerHTML = waterfallResources.map(r => {
      const leftPct = (r.startTime / maxEnd) * 100;
      const widthPct = Math.max((r.duration / maxEnd) * 100, 1);

      return `
        <div class="waterfall-row" title="${escapeHtml(r.fullUrl)}">
          <span class="waterfall-name">${escapeHtml(r.name)}</span>
          <div class="waterfall-bar-container">
            <div class="waterfall-bar-fill ${r.type}" style="left:${leftPct}%;width:${widthPct}%"></div>
          </div>
          <span class="waterfall-duration">${r.duration}ms</span>
        </div>
      `;
    }).join('');
  }

  // Long tasks
  const longTasksList = document.getElementById('longTasksList');
  if (longTasks.length === 0) {
    longTasksList.innerHTML = '<p class="empty-state">No long tasks detected</p>';
  } else {
    const maxDuration = Math.max(...longTasks.map(t => t.duration), 100);

    longTasksList.innerHTML = longTasks.map(task => {
      const severity = task.duration > 200 ? 'critical' : 'warning';
      const barPct = Math.min((task.duration / maxDuration) * 100, 100);

      return `
        <div class="long-task-item ${severity}">
          <div class="long-task-bar">
            <div class="long-task-bar-fill" style="width:${barPct}%"></div>
          </div>
          <span class="long-task-duration">${task.duration}ms</span>
          <span class="long-task-time">at ${formatTime(task.startTime)}</span>
        </div>
      `;
    }).join('');
  }

  // Fonts
  const fontAnalysis = document.getElementById('fontAnalysis');
  if (fonts.length === 0) {
    fontAnalysis.innerHTML = '<p class="empty-state">No custom fonts detected</p>';
  } else {
    // Deduplicate by family name
    const uniqueFonts = [];
    const seen = new Set();
    fonts.forEach(f => {
      if (!seen.has(f.family)) {
        seen.add(f.family);
        uniqueFonts.push(f);
      }
    });

    fontAnalysis.innerHTML = uniqueFonts.slice(0, 10).map(font => {
      const statusClass = font.status === 'loaded' ? 'loaded' : font.status === 'loading' ? 'loading' : 'error';
      return `
        <div class="font-item">
          <div class="font-status-dot ${statusClass}"></div>
          <span class="font-name">${escapeHtml(font.family)}</span>
          <span class="font-display">${font.display}</span>
        </div>
      `;
    }).join('');
  }

  // Inline stats
  const inlineStatsEl = document.getElementById('inlineStats');
  inlineStatsEl.innerHTML = `
    <div class="inline-stat-row">
      <span class="inline-stat-label">Inline Scripts</span>
      <span class="inline-stat-value">${inlineStats.scriptCount} (${formatBytes(inlineStats.scriptSize)})</span>
    </div>
    <div class="inline-stat-row">
      <span class="inline-stat-label">Inline Styles</span>
      <span class="inline-stat-value">${inlineStats.styleCount} (${formatBytes(inlineStats.styleSize)})</span>
    </div>
    <div class="inline-stat-row">
      <span class="inline-stat-label">Total Inline</span>
      <span class="inline-stat-value">${formatBytes(inlineStats.scriptSize + inlineStats.styleSize)}</span>
    </div>
  `;

  // Connection info
  const connInfo = document.getElementById('connectionInfo');
  connInfo.innerHTML = `
    <div class="connection-row">
      <span class="connection-label">Protocol</span>
      <span class="connection-value">${connectionInfo.protocol || 'Unknown'}</span>
    </div>
    <div class="connection-row">
      <span class="connection-label">Effective Type</span>
      <span class="connection-value">${connectionInfo.effectiveType || 'Unknown'}</span>
    </div>
    <div class="connection-row">
      <span class="connection-label">Total Load Time</span>
      <span class="connection-value">${formatTime(analysisResults.navigation.totalLoad)}</span>
    </div>
  `;
}

// Highlight an image on the page by injecting a temporary overlay
async function highlightImageOnPage(imageUrl) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Close the popup so it doesn't cover the highlighted image
    // The script injection happens before close, so it still executes
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (url) => {
        // Remove any existing highlights
        document.querySelectorAll('.owsh-highlight-overlay').forEach(el => el.remove());

        // Add animation style if not already present
        if (!document.getElementById('owsh-highlight-styles')) {
          const style = document.createElement('style');
          style.id = 'owsh-highlight-styles';
          style.textContent = `
            @keyframes owsh-pulse {
              0% { opacity: 0; transform: scale(1.05); }
              15% { opacity: 1; transform: scale(1); }
              80% { opacity: 1; }
              100% { opacity: 0; }
            }
          `;
          document.head.appendChild(style);
        }

        // Find matching images
        const images = document.querySelectorAll('img');
        let found = false;
        images.forEach(img => {
          const src = img.currentSrc || img.src || '';
          if (src === url || src.includes(url) || url.includes(src)) {
            found = true;
            // Scroll first, then position overlay AFTER scroll completes
            img.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Wait for scroll to settle before measuring position
            setTimeout(() => {
              const rect = img.getBoundingClientRect();
              const overlay = document.createElement('div');
              overlay.className = 'owsh-highlight-overlay';
              overlay.style.cssText = `
                position: fixed;
                top: ${rect.top - 4}px;
                left: ${rect.left - 4}px;
                width: ${rect.width + 8}px;
                height: ${rect.height + 8}px;
                border: 3px solid #ea580c;
                border-radius: 8px;
                background: rgba(234, 88, 12, 0.1);
                z-index: 999999;
                pointer-events: none;
                animation: owsh-pulse 2.5s ease-in-out;
              `;
              document.body.appendChild(overlay);
              setTimeout(() => overlay.remove(), 2800);
            }, 600);
          }
        });

        if (!found) {
          const toast = document.createElement('div');
          toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #1c1917; color: white; padding: 8px 16px; border-radius: 8px;
            font-size: 13px; z-index: 999999; font-family: system-ui;
          `;
          toast.textContent = 'Image not visible on screen';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2000);
        }
      },
      args: [imageUrl]
    });

    // Close popup after injecting the script so the page is fully visible
    setTimeout(() => window.close(), 150);
  } catch (err) {
    console.error('Failed to highlight image:', err);
  }
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────
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

async function updateBadge(score) {
  try {
    // Clear badge - don't overlay score on the icon
    await chrome.action.setBadgeText({ text: '' });
  } catch (err) { /* badge API may not be available */ }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(ms) {
  if (ms === 0 || ms === null || ms === undefined) return '0ms';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return Math.round(ms) + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
