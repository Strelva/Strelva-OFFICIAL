// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const currentUrlElement = document.getElementById('currentUrl');
const fullReportBtn = document.getElementById('fullReportBtn');

// Schema Elements
const schemaContent = document.getElementById('schemaContent');
const schemaStatusCard = document.getElementById('schemaStatusCard');
const schemaStatusIcon = document.getElementById('schemaStatusIcon');
const schemaStatusLabel = document.getElementById('schemaStatusLabel');
const schemaTypesSection = document.getElementById('schemaTypesSection');
const schemaTypes = document.getElementById('schemaTypes');
const schemaRawSection = document.getElementById('schemaRawSection');
const schemaRawContent = document.getElementById('schemaRawContent');
const schemaIssuesSection = document.getElementById('schemaIssuesSection');
const schemaIssues = document.getElementById('schemaIssues');

// Sitemap Elements
const sitemapContent = document.getElementById('sitemapContent');
const sitemapStatusCard = document.getElementById('sitemapStatusCard');
const sitemapStatusIcon = document.getElementById('sitemapStatusIcon');
const sitemapStatusLabel = document.getElementById('sitemapStatusLabel');
const sitemapChecksSection = document.getElementById('sitemapChecksSection');
const sitemapChecks = document.getElementById('sitemapChecks');
const sitemapDetailsSection = document.getElementById('sitemapDetailsSection');
const sitemapDetails = document.getElementById('sitemapDetails');
const robotsContentSection = document.getElementById('robotsContentSection');
const robotsContent = document.getElementById('robotsContent');
const sitemapUrlsSection = document.getElementById('sitemapUrlsSection');
const sitemapUrls = document.getElementById('sitemapUrls');

// State
let currentUrl = '';
let currentTab = 'schema';
let schemaResult = null;
let sitemapResult = null;
let baseUrl = '';

// Schema validation requirements based on Google's Rich Results
const SCHEMA_REQUIREMENTS = {
  LocalBusiness: {
    richResultType: 'Local Business',
    required: ['name', 'address'],
    recommended: ['telephone', 'openingHours', 'image', 'priceRange', 'geo', 'url', 'aggregateRating'],
  },
  Organization: {
    richResultType: 'Organization',
    required: ['name', 'url'],
    recommended: ['logo', 'sameAs', 'contactPoint', 'description'],
  },
  Product: {
    richResultType: 'Product Snippets',
    required: ['name'],
    recommended: ['image', 'description', 'offers', 'aggregateRating', 'review', 'brand', 'sku'],
  },
  Article: {
    richResultType: 'Article',
    required: ['headline', 'image', 'datePublished', 'author'],
    recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'],
  },
  BlogPosting: {
    richResultType: 'Article',
    required: ['headline', 'image', 'datePublished', 'author'],
    recommended: ['dateModified', 'publisher', 'description', 'mainEntityOfPage'],
  },
  FAQPage: {
    richResultType: 'FAQ',
    required: ['mainEntity'],
    recommended: [],
  },
  HowTo: {
    richResultType: 'How-to',
    required: ['name', 'step'],
    recommended: ['image', 'totalTime', 'estimatedCost', 'supply', 'tool'],
  },
  Recipe: {
    richResultType: 'Recipe',
    required: ['name', 'image'],
    recommended: ['author', 'datePublished', 'description', 'prepTime', 'cookTime', 'recipeIngredient', 'recipeInstructions', 'aggregateRating'],
  },
  Event: {
    richResultType: 'Event',
    required: ['name', 'startDate', 'location'],
    recommended: ['endDate', 'description', 'image', 'offers', 'performer', 'organizer'],
  },
  JobPosting: {
    richResultType: 'Job Posting',
    required: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'],
    recommended: ['validThrough', 'employmentType', 'baseSalary'],
  },
  Course: {
    richResultType: 'Course',
    required: ['name', 'description', 'provider'],
    recommended: ['image', 'offers', 'hasCourseInstance'],
  },
  BreadcrumbList: {
    richResultType: 'Breadcrumb',
    required: ['itemListElement'],
    recommended: [],
  },
  WebSite: {
    richResultType: 'Sitelinks Search Box',
    required: ['name', 'url'],
    recommended: ['potentialAction'],
  },
  VideoObject: {
    richResultType: 'Video',
    required: ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    recommended: ['duration', 'contentUrl', 'embedUrl'],
  },
};

// Validate schema against Google requirements
function validateSchema(data, typeName) {
  const requirements = SCHEMA_REQUIREMENTS[typeName];
  if (!requirements) {
    return {
      eligible: 'partial',
      score: 50,
      richResultType: null,
      summary: `${typeName} detected. No specific rich result requirements defined.`,
      requiredFields: [],
      recommendedFields: [],
    };
  }

  const requiredFields = requirements.required.map(field => ({
    field,
    present: data[field] !== undefined && data[field] !== null && data[field] !== '',
  }));

  const recommendedFields = requirements.recommended.map(field => ({
    field,
    present: data[field] !== undefined && data[field] !== null && data[field] !== '',
  }));

  const requiredPresent = requiredFields.filter(f => f.present).length;
  const requiredTotal = requiredFields.length;
  const recommendedPresent = recommendedFields.filter(f => f.present).length;
  const recommendedTotal = recommendedFields.length;

  const requiredScore = requiredTotal > 0 ? (requiredPresent / requiredTotal) * 70 : 70;
  const recommendedScore = recommendedTotal > 0 ? (recommendedPresent / recommendedTotal) * 30 : 30;
  const score = Math.round(requiredScore + recommendedScore);

  let eligible, summary;
  if (requiredPresent === requiredTotal) {
    eligible = 'yes';
    summary = `Eligible for ${requirements.richResultType} rich results.`;
  } else if (requiredPresent >= requiredTotal * 0.5) {
    eligible = 'partial';
    const missing = requiredFields.filter(f => !f.present).map(f => f.field).join(', ');
    summary = `Partially eligible. Missing: ${missing}`;
  } else {
    eligible = 'no';
    const missing = requiredFields.filter(f => !f.present).map(f => f.field).join(', ');
    summary = `Not eligible. Missing: ${missing}`;
  }

  return {
    eligible,
    score,
    richResultType: requirements.richResultType,
    summary,
    requiredFields,
    recommendedFields,
  };
}

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Set up tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Set up full report button
  fullReportBtn.addEventListener('click', openFullReport);

  // Get current tab URL and analyze
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentUrl = tab.url;
      baseUrl = new URL(currentUrl).origin;
      currentUrlElement.textContent = truncateUrl(currentUrl, 50);

      // Check if it's a valid URL to analyze
      if (!isValidUrl(currentUrl)) {
        showError('Cannot analyze this page type');
        return;
      }

      await analyzeAll(tab);
    } else {
      showError('Unable to get current page');
    }
  } catch (error) {
    console.error('Init error:', error);
    showError('Failed to initialize');
  }
}

function isValidUrl(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}

function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update content visibility
  schemaContent.classList.toggle('hidden', tabName !== 'schema');
  sitemapContent.classList.toggle('hidden', tabName !== 'sitemap');
}

function openFullReport() {
  const url = encodeURIComponent(currentUrl);
  window.open(`https://audit.owshsystems.com/schema-sitemap?url=${url}`, '_blank');
}

async function analyzeAll(tab) {
  showLoading();

  try {
    // Analyze schema from page content
    const schemaData = await analyzeSchema(tab);
    schemaResult = schemaData;
    renderSchemaResults(schemaData);

    // Analyze sitemap (runs in page context for same-origin fetches)
    const sitemapData = await analyzeSitemap(tab);
    sitemapResult = sitemapData;
    renderSitemapResults(sitemapData);

    hideLoading();
  } catch (error) {
    console.error('Analysis error:', error);
    showError('Failed to analyze page');
  }
}

// Schema Analysis
async function analyzeSchema(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSchemaFromPage,
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
    return { status: 'missing', types: [], issues: [{ severity: 'error', message: 'No schema detected' }], rawSchemas: [] };
  } catch (error) {
    console.error('Schema extraction error:', error);
    return { status: 'missing', types: [], issues: [{ severity: 'error', message: 'Could not access page content' }], rawSchemas: [] };
  }
}

// This function runs in the page context
function extractSchemaFromPage() {
  const types = [];
  const issues = [];
  const rawSchemas = [];

  // Find JSON-LD scripts
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');

  jsonLdScripts.forEach((script, scriptIndex) => {
    try {
      const content = script.textContent.trim();
      const data = JSON.parse(content);

      // Pretty print the JSON for display
      const prettyJson = JSON.stringify(data, null, 2);

      // Store raw schema with pretty formatting
      rawSchemas.push({
        raw: prettyJson.length > 5000 ? prettyJson.substring(0, 5000) + '\n... (truncated)' : prettyJson,
        parsed: true,
        index: scriptIndex + 1
      });

      function extractTypes(obj, parentContext = null) {
        if (Array.isArray(obj)) {
          obj.forEach(item => extractTypes(item, parentContext));
        } else if (obj && typeof obj === 'object') {
          const context = obj['@context'] || parentContext;

          // Handle @graph
          if (obj['@graph'] && Array.isArray(obj['@graph'])) {
            obj['@graph'].forEach(item => extractTypes(item, context));
          }

          // Extract type
          if (obj['@type']) {
            const typeName = Array.isArray(obj['@type']) ? obj['@type'][0] : obj['@type'];

            // Extract key properties for this type
            const properties = {};
            if (obj.name) properties.name = typeof obj.name === 'string' ? obj.name.substring(0, 50) : 'Present';
            if (obj.description) properties.description = 'Present';
            if (obj.image) properties.image = 'Present';
            if (obj.url) properties.url = 'Present';
            if (obj.address) properties.address = 'Present';
            if (obj.telephone) properties.telephone = 'Present';
            if (obj.priceRange) properties.priceRange = obj.priceRange;
            if (obj.aggregateRating) properties.rating = obj.aggregateRating.ratingValue;
            if (obj.review) properties.reviews = Array.isArray(obj.review) ? obj.review.length : 1;

            types.push({
              type: typeName,
              source: 'JSON-LD',
              hasContext: !!context,
              hasType: true,
              hasRequiredFields: Object.keys(properties).length > 0,
              properties: properties,
              rawData: obj // Store raw data for validation
            });
          }
        }
      }

      extractTypes(data);
    } catch (e) {
      issues.push({ severity: 'error', message: `Invalid JSON-LD syntax in script #${scriptIndex + 1}` });
      rawSchemas.push({
        raw: script.textContent.trim().substring(0, 500) + '\n... (parse error)',
        parsed: false,
        error: e.message,
        index: scriptIndex + 1
      });
    }
  });

  // Find Microdata
  const microdataElements = document.querySelectorAll('[itemtype*="schema.org"]');
  microdataElements.forEach(el => {
    const itemtype = el.getAttribute('itemtype');
    const match = itemtype.match(/schema\.org\/(\w+)/);
    if (match) {
      const typeName = match[1];
      if (!types.some(t => t.type === typeName && t.source === 'Microdata')) {
        // Extract microdata properties
        const properties = {};
        const props = el.querySelectorAll('[itemprop]');
        props.forEach(prop => {
          const propName = prop.getAttribute('itemprop');
          if (['name', 'description', 'image', 'url', 'telephone', 'address'].includes(propName)) {
            properties[propName] = 'Present';
          }
        });

        types.push({
          type: typeName,
          source: 'Microdata',
          hasContext: true,
          hasType: true,
          hasRequiredFields: Object.keys(properties).length > 0,
          properties: properties
        });
      }
    }
  });

  // Determine status
  let status = 'missing';
  if (types.length > 0) {
    const hasValidSchema = types.some(t => t.hasContext && t.hasType);
    status = hasValidSchema ? 'pass' : 'partial';
  }

  if (types.length === 0) {
    issues.push({ severity: 'error', message: 'No schema markup found on this page' });
  }

  return { status, types, issues, rawSchemas };
}

// Sitemap Analysis - runs in page context via chrome.scripting.executeScript
async function analyzeSitemap(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchSitemapDataFromPage,
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
    return {
      status: 'missing',
      checks: [],
      details: null,
      issues: [{ severity: 'error', message: 'Could not analyze sitemap' }],
      robotsTxtSitemapRef: null,
      robotsTxtContent: null,
      robotsDirectives: [],
      sitemapUrlsList: [],
      sitemapLocation: null
    };
  } catch (error) {
    console.error('Sitemap analysis error:', error);
    return {
      status: 'missing',
      checks: [],
      details: null,
      issues: [{ severity: 'error', message: 'Could not access page for sitemap analysis' }],
      robotsTxtSitemapRef: null,
      robotsTxtContent: null,
      robotsDirectives: [],
      sitemapUrlsList: [],
      sitemapLocation: null
    };
  }
}

// This function runs in the page context to fetch sitemap data (same-origin requests)
async function fetchSitemapDataFromPage() {
  const baseUrl = window.location.origin;
  const checks = [];
  let foundSitemap = false;
  let details = null;
  const issues = [];
  let robotsTxtSitemapRef = null;
  let robotsTxtContent = null;
  let robotsDirectives = [];
  let sitemapUrlsList = [];
  let sitemapLocation = null;

  // Helper functions (must be inside since this runs in page context)
  function parseRobotsTxt(content) {
    const directives = [];
    const lines = content.split('\n');
    let currentUserAgent = null;

    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;

      const match = line.match(/^([^:]+):\s*(.+)$/i);
      if (match) {
        const directive = match[1].toLowerCase();
        const value = match[2].trim();

        if (directive === 'user-agent') {
          currentUserAgent = value;
          directives.push({ type: 'user-agent', value, agent: value });
        } else if (directive === 'disallow' && value) {
          directives.push({ type: 'disallow', value, agent: currentUserAgent });
        } else if (directive === 'allow' && value) {
          directives.push({ type: 'allow', value, agent: currentUserAgent });
        } else if (directive === 'sitemap') {
          directives.push({ type: 'sitemap', value });
        } else if (directive === 'crawl-delay') {
          directives.push({ type: 'crawl-delay', value, agent: currentUserAgent });
        }
      }
    });

    return directives;
  }

  function isValidSitemapXml(content) {
    return content.includes('<urlset') || content.includes('<sitemapindex');
  }

  function parseSitemapDetails(content) {
    const isIndex = content.includes('<sitemapindex');
    const urlMatches = content.match(isIndex ? /<sitemap>/gi : /<url>/gi);
    const urlCount = urlMatches ? urlMatches.length : 0;
    const hasLastModified = /<lastmod>/i.test(content);
    const hasChangefreq = /<changefreq>/i.test(content);
    const hasPriority = /<priority>/i.test(content);

    return {
      type: isIndex ? 'sitemapindex' : 'urlset',
      urlCount,
      hasLastModified,
      hasChangefreq,
      hasPriority
    };
  }

  function extractSitemapUrls(content, limit = 10) {
    const urls = [];
    const locMatches = content.match(/<loc>([^<]+)<\/loc>/gi);
    if (locMatches) {
      for (let i = 0; i < Math.min(locMatches.length, limit); i++) {
        const urlMatch = locMatches[i].match(/<loc>([^<]+)<\/loc>/i);
        if (urlMatch && urlMatch[1]) {
          urls.push(urlMatch[1]);
        }
      }
    }
    return urls;
  }

  // Check robots.txt
  try {
    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    if (robotsResponse.ok) {
      const robotsText = await robotsResponse.text();
      robotsTxtContent = robotsText;
      checks.push({
        location: '/robots.txt',
        status: 'found',
        message: 'robots.txt is accessible',
        url: `${baseUrl}/robots.txt`
      });

      robotsDirectives = parseRobotsTxt(robotsText);

      const sitemapMatch = robotsText.match(/sitemap:\s*(.+)/i);
      if (sitemapMatch) {
        robotsTxtSitemapRef = sitemapMatch[1].trim();
      } else {
        issues.push({ severity: 'warning', message: 'Sitemap not declared in robots.txt' });
      }
    } else if (robotsResponse.status === 404) {
      checks.push({ location: '/robots.txt', status: 'not_found', message: 'robots.txt not found' });
      issues.push({ severity: 'warning', message: 'No robots.txt file found' });
    } else {
      checks.push({ location: '/robots.txt', status: 'blocked', message: `HTTP ${robotsResponse.status}` });
    }
  } catch (e) {
    checks.push({ location: '/robots.txt', status: 'blocked', message: 'Could not fetch (network error)' });
  }

  // Check sitemap.xml
  try {
    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
    if (sitemapResponse.ok) {
      const sitemapText = await sitemapResponse.text();
      if (isValidSitemapXml(sitemapText)) {
        checks.push({
          location: '/sitemap.xml',
          status: 'found',
          message: 'Valid XML sitemap',
          url: `${baseUrl}/sitemap.xml`
        });
        foundSitemap = true;
        sitemapLocation = `${baseUrl}/sitemap.xml`;
        details = parseSitemapDetails(sitemapText);
        sitemapUrlsList = extractSitemapUrls(sitemapText, 10);
      } else {
        checks.push({ location: '/sitemap.xml', status: 'invalid', message: 'Not valid XML sitemap format' });
        issues.push({ severity: 'error', message: 'sitemap.xml exists but is not valid XML' });
      }
    } else if (sitemapResponse.status === 404) {
      checks.push({ location: '/sitemap.xml', status: 'not_found', message: 'Not found at this location' });
    } else {
      checks.push({ location: '/sitemap.xml', status: 'blocked', message: `HTTP ${sitemapResponse.status}` });
    }
  } catch (e) {
    checks.push({ location: '/sitemap.xml', status: 'blocked', message: 'Could not fetch (network error)' });
  }

  // Check sitemap_index.xml
  try {
    const indexResponse = await fetch(`${baseUrl}/sitemap_index.xml`);
    if (indexResponse.ok) {
      const indexText = await indexResponse.text();
      if (isValidSitemapXml(indexText)) {
        checks.push({
          location: '/sitemap_index.xml',
          status: 'found',
          message: 'Valid sitemap index',
          url: `${baseUrl}/sitemap_index.xml`
        });
        if (!foundSitemap) {
          foundSitemap = true;
          sitemapLocation = `${baseUrl}/sitemap_index.xml`;
          details = parseSitemapDetails(indexText);
          sitemapUrlsList = extractSitemapUrls(indexText, 10);
        }
      } else {
        checks.push({ location: '/sitemap_index.xml', status: 'invalid', message: 'Not valid XML format' });
      }
    } else if (indexResponse.status === 404) {
      checks.push({ location: '/sitemap_index.xml', status: 'not_found', message: 'Not found at this location' });
    } else {
      checks.push({ location: '/sitemap_index.xml', status: 'blocked', message: `HTTP ${indexResponse.status}` });
    }
  } catch (e) {
    checks.push({ location: '/sitemap_index.xml', status: 'blocked', message: 'Could not fetch (network error)' });
  }

  if (!foundSitemap) {
    issues.push({ severity: 'error', message: 'No valid sitemap found' });
  }

  const status = foundSitemap ? (checks.some(c => c.status === 'invalid') ? 'invalid' : 'found') : 'missing';

  return {
    status,
    checks,
    details,
    issues,
    robotsTxtSitemapRef,
    robotsTxtContent,
    robotsDirectives,
    sitemapUrlsList,
    sitemapLocation
  };
}

// Rendering
function renderValidation(validation) {
  const eligibleClass = validation.eligible === 'yes' ? 'eligible' : validation.eligible === 'partial' ? 'partial' : 'not-eligible';
  const eligibleText = validation.eligible === 'yes' ? 'Eligible' : validation.eligible === 'partial' ? 'Partial' : 'Not Eligible';
  const eligibleIcon = validation.eligible === 'yes' ? '✓' : validation.eligible === 'partial' ? '!' : '✗';

  let fieldsHtml = '';

  // Show required fields
  if (validation.requiredFields.length > 0) {
    fieldsHtml += `
      <div class="validation-fields">
        <div class="validation-fields-label">Required:</div>
        <div class="validation-fields-list">
          ${validation.requiredFields.map(f => `
            <span class="validation-field ${f.present ? 'present' : 'missing'}">${f.present ? '✓' : '✗'} ${escapeHtml(f.field)}</span>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Show recommended fields (collapsed by default)
  if (validation.recommendedFields.length > 0) {
    const presentCount = validation.recommendedFields.filter(f => f.present).length;
    fieldsHtml += `
      <div class="validation-fields">
        <div class="validation-fields-label">Recommended (${presentCount}/${validation.recommendedFields.length}):</div>
        <div class="validation-fields-list">
          ${validation.recommendedFields.map(f => `
            <span class="validation-field ${f.present ? 'present' : 'missing'}">${f.present ? '✓' : '○'} ${escapeHtml(f.field)}</span>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="validation-section">
      <div class="validation-header">
        <div class="validation-top-row">
          <div class="validation-eligibility ${eligibleClass}">
            <span class="eligibility-icon">${eligibleIcon}</span>
            <span class="eligibility-text">${eligibleText}</span>
          </div>
          <div class="validation-score">
            <span class="score-value">${validation.score}</span>
            <span class="score-label">/ 100</span>
          </div>
        </div>
        ${validation.richResultType ? `<span class="rich-result-type">${escapeHtml(validation.richResultType)}</span>` : ''}
      </div>
      <div class="validation-summary">${escapeHtml(validation.summary)}</div>
      ${fieldsHtml}
    </div>
  `;
}

function renderSchemaResults(data) {
  // Status card
  const statusClass = data.status;
  schemaStatusCard.className = `status-card ${statusClass}`;
  schemaStatusIcon.className = `status-icon ${statusClass}`;
  schemaStatusIcon.innerHTML = getStatusIcon(data.status);
  schemaStatusLabel.className = `status-label ${statusClass}`;
  schemaStatusLabel.textContent = data.status === 'pass' ? 'Valid Schema Found' : data.status === 'partial' ? 'Partial Schema' : 'No Schema';

  // Schema types with validation
  if (data.types.length > 0) {
    schemaTypesSection.classList.remove('hidden');
    schemaTypes.innerHTML = data.types.map(type => {
      // Run validation if we have raw data
      const validation = type.rawData ? validateSchema(type.rawData, type.type) : null;

      return `
      <div class="schema-type">
        <div class="schema-type-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <div class="schema-type-info">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="schema-type-name">${escapeHtml(type.type)}</span>
            <span class="schema-type-source">${type.source}</span>
          </div>
          <div class="schema-type-checks">
            <span class="schema-check ${type.hasContext ? 'pass' : 'fail'}">
              ${type.hasContext ? '✓' : '✗'} @context
            </span>
            <span class="schema-check ${type.hasType ? 'pass' : 'fail'}">
              ${type.hasType ? '✓' : '✗'} @type
            </span>
          </div>
          ${type.properties && Object.keys(type.properties).length > 0 ? `
            <div class="schema-properties">
              ${Object.entries(type.properties).map(([key, value]) => `
                <span class="schema-prop">${escapeHtml(key)}${value !== 'Present' ? `: ${escapeHtml(String(value))}` : ''}</span>
              `).join('')}
            </div>
          ` : ''}
          ${validation ? renderValidation(validation) : ''}
        </div>
      </div>
    `;
    }).join('');
  } else {
    schemaTypesSection.classList.remove('hidden');
    schemaTypes.innerHTML = '<div class="no-schema">No schema markup detected on this page</div>';
  }

  // Raw Schema Content
  if (data.rawSchemas && data.rawSchemas.length > 0) {
    schemaRawSection.classList.remove('hidden');
    schemaRawContent.innerHTML = data.rawSchemas.map((schema) => `
      <div class="raw-schema-block">
        <div class="raw-schema-header">
          <span>JSON-LD #${schema.index}</span>
          <div class="raw-schema-actions">
            ${!schema.parsed ? '<span class="raw-schema-error">Parse Error</span>' : ''}
            <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeForAttribute(schema.raw)}\`)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
          </div>
        </div>
        <pre class="raw-schema-code">${escapeHtml(schema.raw)}</pre>
      </div>
    `).join('');
  } else {
    schemaRawSection.classList.add('hidden');
  }

  // Issues
  if (data.issues && data.issues.length > 0) {
    schemaIssuesSection.classList.remove('hidden');
    schemaIssues.innerHTML = data.issues.map(issue => `
      <div class="issue-item ${issue.severity}">
        <div class="issue-icon ${issue.severity}">
          ${issue.severity === 'error' ?
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' :
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
          }
        </div>
        <span class="issue-text">${escapeHtml(issue.message)}</span>
      </div>
    `).join('');
  } else {
    schemaIssuesSection.classList.add('hidden');
  }
}

function renderSitemapResults(data) {
  // Status card
  const statusClass = data.status;
  sitemapStatusCard.className = `status-card ${statusClass}`;
  sitemapStatusIcon.className = `status-icon ${statusClass}`;
  sitemapStatusIcon.innerHTML = getStatusIcon(data.status === 'found' ? 'pass' : data.status === 'invalid' ? 'partial' : 'missing');
  sitemapStatusLabel.className = `status-label ${statusClass}`;
  sitemapStatusLabel.textContent = data.status === 'found' ? 'Sitemap Found' : data.status === 'invalid' ? 'Invalid Sitemap' : 'No Sitemap';

  // Checks with clickable links
  sitemapChecks.innerHTML = data.checks.map(check => `
    <div class="check-item">
      <div class="check-icon ${check.status}">
        ${getCheckIcon(check.status)}
      </div>
      <div class="check-info">
        ${check.url ?
          `<a href="${check.url}" target="_blank" class="check-location-link">${check.location}</a>` :
          `<div class="check-location">${check.location}</div>`
        }
        <div class="check-message">${escapeHtml(check.message)}</div>
      </div>
      <span class="check-badge ${check.status}">${check.status.replace('_', ' ')}</span>
    </div>
  `).join('');

  // Details
  if (data.details) {
    sitemapDetailsSection.classList.remove('hidden');
    sitemapDetails.innerHTML = `
      <div class="detail-item">
        <div class="detail-label">Type</div>
        <div class="detail-value">${data.details.type === 'urlset' ? 'Standard' : 'Index'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">${data.details.type === 'urlset' ? 'URLs' : 'Sitemaps'}</div>
        <div class="detail-value">${data.details.urlCount.toLocaleString()}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">lastmod</div>
        <div class="detail-value">${data.details.hasLastModified ? '✓ Yes' : '✗ No'}</div>
      </div>
    `;

    // Add sitemap reference from robots.txt
    if (data.robotsTxtSitemapRef) {
      sitemapDetails.innerHTML += `
        <div class="detail-item full-width">
          <div class="detail-label">Declared in robots.txt</div>
          <div class="detail-value">
            <a href="${escapeHtml(data.robotsTxtSitemapRef)}" target="_blank" class="sitemap-ref-link">${escapeHtml(data.robotsTxtSitemapRef)}</a>
          </div>
        </div>
      `;
    }
  } else {
    sitemapDetailsSection.classList.add('hidden');
  }

  // Robots.txt content with parsed directives
  if (data.robotsTxtContent) {
    robotsContentSection.classList.remove('hidden');

    // Show parsed directives summary first
    let directivesHtml = '';
    if (data.robotsDirectives && data.robotsDirectives.length > 0) {
      const disallows = data.robotsDirectives.filter(d => d.type === 'disallow');
      const sitemaps = data.robotsDirectives.filter(d => d.type === 'sitemap');

      directivesHtml = `
        <div class="robots-summary">
          <div class="robots-stat">
            <span class="robots-stat-value">${disallows.length}</span>
            <span class="robots-stat-label">Disallow rules</span>
          </div>
          <div class="robots-stat">
            <span class="robots-stat-value">${sitemaps.length}</span>
            <span class="robots-stat-label">Sitemap refs</span>
          </div>
        </div>
      `;
    }

    robotsContent.innerHTML = `
      ${directivesHtml}
      <div class="raw-content-header">
        <span>Raw Content</span>
        <a href="${baseUrl}/robots.txt" target="_blank" class="view-link">View file</a>
      </div>
      <pre class="raw-content-code">${escapeHtml(data.robotsTxtContent.substring(0, 1500))}${data.robotsTxtContent.length > 1500 ? '\n... (truncated)' : ''}</pre>
    `;
  } else {
    robotsContentSection.classList.add('hidden');
  }

  // Sitemap URLs
  if (data.sitemapUrlsList && data.sitemapUrlsList.length > 0) {
    sitemapUrlsSection.classList.remove('hidden');
    const isIndex = data.details && data.details.type === 'sitemapindex';

    sitemapUrls.innerHTML = `
      <div class="sitemap-urls-header">
        Sample ${isIndex ? 'Child Sitemaps' : 'URLs'} (${data.sitemapUrlsList.length} shown)
      </div>
      ${data.sitemapUrlsList.map(url => `
        <a href="${escapeHtml(url)}" target="_blank" class="sitemap-url-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span class="sitemap-url-text">${escapeHtml(url)}</span>
        </a>
      `).join('')}
    `;
  } else {
    sitemapUrlsSection.classList.add('hidden');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeForAttribute(text) {
  return text.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// Global copy function
window.copyToClipboard = function(button, text) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.innerHTML;
    button.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    button.classList.add('copied');
    setTimeout(() => {
      button.innerHTML = originalText;
      button.classList.remove('copied');
    }, 2000);
  });
};

function getStatusIcon(status) {
  if (status === 'pass' || status === 'found') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  } else if (status === 'partial' || status === 'invalid') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  }
}

function getCheckIcon(status) {
  if (status === 'found') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  } else if (status === 'not_found') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else if (status === 'blocked' || status === 'invalid') {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';
  }
  return '';
}

// UI Helpers
function showLoading() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  schemaContent.classList.add('hidden');
  sitemapContent.classList.add('hidden');
}

function hideLoading() {
  loadingState.classList.add('hidden');
  schemaContent.classList.remove('hidden');
  if (currentTab === 'sitemap') {
    sitemapContent.classList.remove('hidden');
  }
}

function showError(message) {
  loadingState.classList.add('hidden');
  errorState.classList.remove('hidden');
  errorMessage.textContent = message;
  schemaContent.classList.add('hidden');
  sitemapContent.classList.add('hidden');
}
