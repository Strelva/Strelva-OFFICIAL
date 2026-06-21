import type { GuideArticle } from "@/lib/guides";

/**
 * Batch 1 of Strelva's guide library.
 *
 * Repurposed from the OWSH Systems fix guides into owner-friendly SEO articles
 * ("how to fix X on your website"). These rank for the problems Strelva's free
 * audit surfaces and funnel readers into it. Strelva fixes these for managed
 * clients, so the articles are marketing, not a self-serve deliverable.
 *
 * Source categories covered here: the OWSH "technically-sound" and "data-driven"
 * fix-guide folders. Verified and updated for 2026 (WCAG 2.2 AA, GA4, current
 * Core Web Vitals). Overlapping source guides were merged rather than shipped as
 * near-duplicate filler.
 */
export const batch1: GuideArticle[] = [
  {
    slug: "add-xml-sitemap-google-find-pages",
    title: "How to Add an XML Sitemap So Google Can Find Every Page",
    excerpt:
      "An XML sitemap is a map of your site handed straight to search engines. Here is how to create one, point Google at it, and confirm your pages are getting indexed.",
    category: "Technical SEO",
    difficulty: "easy",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Create and Submit an XML Sitemap (2026 Guide)",
    seoDescription:
      "Step-by-step guide to creating an XML sitemap, referencing it in robots.txt, and submitting it to Google Search Console so every page gets discovered.",
    bodyHtml: `<p>An XML sitemap is a single file that lists the pages you want search engines to index. It will not magically rank you, but it removes a real failure mode: pages that Google never finds because nothing links to them well. If your site is new, large, or lightly linked, a sitemap is the cheapest way to make sure nothing important stays invisible.</p>
<h2>What a sitemap actually does</h2>
<p>It hands search engines a clean list of your canonical URLs so they do not have to discover everything by following links. That speeds up the discovery of new pages and helps Google understand which version of a URL you consider the real one.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Check whether you already have one.</strong> Visit <em>yoursite.com/sitemap.xml</em> and <em>yoursite.com/sitemap_index.xml</em>. Most modern platforms and SEO plugins generate one automatically. If you see XML listing your pages, you already have it and can skip to submission.</li>
<li><strong>Generate or enable it.</strong> On a hosted platform, turn on the sitemap setting (often in the SEO area) or install an SEO plugin. On a coded site, generate <em>sitemap.xml</em> at build time so it stays current, and place it in your web root.</li>
<li><strong>Include only the right URLs.</strong> List live, indexable pages using your canonical domain and HTTPS. Leave out admin pages, thank-you pages, redirects, and anything tagged noindex. Conflicting signals waste crawl budget.</li>
<li><strong>Reference it in robots.txt.</strong> Add a line at the end: <em>Sitemap: https://yoursite.com/sitemap.xml</em>, using the full absolute URL.</li>
<li><strong>Submit it to Google Search Console.</strong> Open the Sitemaps section, enter the sitemap path, and submit. Status moves from Pending to Success. Bing Webmaster Tools is worth a second submission.</li>
<li><strong>Confirm indexing.</strong> After a day or two, check the Pages report. The indexed count should roughly track your sitemap. A large gap usually points to content quality, not the sitemap itself.</li>
</ol>
<h2>Keep it healthy</h2>
<p>An auto-generated sitemap updates when content changes; a hand-built one goes stale fast. Re-submit after a major restructure. If you pass 50,000 URLs, split into multiple files behind a sitemap index.</p>
<p>A sitemap is a small fix with a clear payoff: it closes the gap between publishing a page and Google knowing it exists.</p>`,
    faq: [
      {
        question: "Do I need a sitemap if my site is small?",
        answer:
          "It still helps, but it matters most for large sites, new sites, or sites with weak internal linking. For a tidy five-page site that is well linked, Google will likely find everything anyway. There is no downside to having one.",
      },
      {
        question: "My sitemap shows 'Couldn't fetch' in Search Console. Why?",
        answer:
          "Confirm the URL loads in a browser, that robots.txt does not block it, and that your site is not geo-blocking or rate-limiting Googlebot. Then re-submit once it loads cleanly.",
      },
      {
        question: "Pages are in my sitemap but still not indexed. Is the sitemap broken?",
        answer:
          "Usually not. A sitemap requests crawling, it does not guarantee indexing. Pages that are thin, duplicated, or noindexed will be skipped regardless. Improve the page and add internal links to it.",
      },
    ],
  },
  {
    slug: "add-ssl-https-secure-website",
    title: "How to Add SSL (HTTPS) and Stop Browsers Calling Your Site 'Not Secure'",
    excerpt:
      "HTTPS is the baseline for trust, rankings, and modern browsers. Here is how to get a free certificate, force the secure version, and clear the warnings.",
    category: "Security",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "security",
    seoTitle: "How to Add SSL (HTTPS) to Your Website: Free, Step by Step",
    seoDescription:
      "Get a free SSL certificate, force HTTPS, fix mixed-content warnings, and confirm an A grade. A clear guide for non-technical site owners.",
    bodyHtml: `<p>If your site loads over <em>http://</em>, browsers label it <strong>Not Secure</strong> in the address bar. That single phrase scares off customers, and search engines treat HTTPS as a baseline ranking signal. The good news: a certificate is free and the whole job is usually under an hour.</p>
<h2>Why it matters</h2>
<p>SSL encrypts the connection between your site and the visitor, so forms, logins, and payment details cannot be read in transit. Without it, every modern browser flags your site, and any page collecting information is a liability.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Check your current status.</strong> Open your site and look at the address bar. A padlock means SSL is active. A warning means it is missing, expired, or only covering one domain variant. Test both <em>www</em> and non-<em>www</em>.</li>
<li><strong>Get a certificate.</strong> Most hosts issue a free Let's Encrypt certificate from the control panel in a click. Hosted site builders include SSL automatically. Make sure the certificate covers both <em>yoursite.com</em> and <em>www.yoursite.com</em>.</li>
<li><strong>Force HTTPS.</strong> Enable the host's "Force HTTPS" option, or add a 301 redirect from HTTP to HTTPS. Use 301 (permanent) so ranking value transfers. Test an inner page, not just the homepage.</li>
<li><strong>Update internal URLs.</strong> Change any hard-coded <em>http://</em> links to your own domain over to <em>https://</em>, including the sitemap and canonical tags. Relative links (<em>/page</em>) avoid this problem going forward.</li>
<li><strong>Fix mixed content.</strong> Open the browser console and look for "Mixed Content" warnings. Each one names a resource still loading over HTTP, usually an image, font, or script. Switch each to HTTPS or self-host it.</li>
<li><strong>Verify the grade.</strong> Run your domain through SSL Labs and aim for an A. Then update your URL in Search Console, Analytics, and your business listings.</li>
</ol>
<h2>Common traps</h2>
<p>Install and confirm the certificate <strong>before</strong> forcing redirects, or the site can become unreachable. If you hit a redirect loop, you likely have two layers both forcing HTTPS (host and CDN); only one should. Let's Encrypt auto-renews on most hosts, so you rarely touch it again.</p>`,
    faq: [
      {
        question: "Do I have to pay for an SSL certificate?",
        answer:
          "No. Let's Encrypt certificates are free, trusted by every browser, and auto-renew. Only buy a paid certificate if you specifically need Extended Validation, which is rare for small businesses.",
      },
      {
        question: "I installed SSL but the site still says 'Not Secure.' What now?",
        answer:
          "You almost certainly have mixed content: some resource is still loading over HTTP. Open the browser console, find the flagged URL, and switch it to HTTPS. The padlock will not turn green until every resource is secure.",
      },
      {
        question: "Will switching to HTTPS hurt my rankings?",
        answer:
          "Done correctly with 301 redirects, it helps. There may be a brief dip while Google re-indexes the secure URLs, typically a couple of weeks, after which HTTPS is the long-term advantage.",
      },
    ],
  },
  {
    slug: "add-security-headers-website",
    title: "How to Add Security Headers to Protect Your Website and Visitors",
    excerpt:
      "Security headers are a few lines of configuration that block clickjacking, MIME sniffing, and script injection. Here is which ones to add and how.",
    category: "Security",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "security",
    seoTitle: "How to Add Security Headers to Your Website (2026)",
    seoDescription:
      "Add X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and a Content-Security-Policy to harden your site. Plain-English guide with safe defaults.",
    bodyHtml: `<p>Security headers are instructions your server sends with every page that tell the browser how to behave safely. They cost nothing, take minutes to add, and close off whole categories of attack. Security scanners and search tools also read them as a signal that your site is well maintained.</p>
<h2>The four that matter</h2>
<ul>
<li><strong>X-Content-Type-Options: nosniff</strong> stops the browser guessing file types, which blocks a malicious file disguised as an image from running. It is completely safe to add.</li>
<li><strong>X-Frame-Options: SAMEORIGIN</strong> stops other sites embedding yours in a hidden iframe to trick users into clicking (clickjacking). SAMEORIGIN still lets your own previews and widgets work.</li>
<li><strong>Referrer-Policy: strict-origin-when-cross-origin</strong> controls how much of your URL is shared when a visitor clicks out to another site. This is also the modern browser default.</li>
<li><strong>Content-Security-Policy (CSP)</strong> is the most powerful and the most delicate: it lists exactly which sources of scripts, styles, and images are allowed, blocking injected scripts.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li><strong>Add the first three.</strong> Set X-Content-Type-Options, X-Frame-Options, and Referrer-Policy. These almost never break anything, so add them and move on.</li>
<li><strong>Find where headers live.</strong> On a server you control, that is the host config, a <em>vercel.json</em>, or a <em>_headers</em> file. On a locked-down site builder, you add them through a CDN such as Cloudflare sitting in front of the site.</li>
<li><strong>Introduce CSP in report-only mode first.</strong> Use <em>Content-Security-Policy-Report-Only</em> so violations are logged but nothing is blocked. Browse your whole site and watch the console.</li>
<li><strong>Whitelist what you actually use.</strong> Add the sources your real tools need, such as your analytics provider, web fonts, and any embedded video or maps.</li>
<li><strong>Switch CSP to enforcing.</strong> Once the console is clean in report-only mode, rename the header to <em>Content-Security-Policy</em>.</li>
<li><strong>Verify.</strong> Run your URL through a security-headers scanner and aim for at least a B (all four except a strict CSP) or an A with CSP.</li>
</ol>
<h2>A realistic standard</h2>
<p>If CSP feels like too much, the other three headers alone are a meaningful upgrade and carry almost no risk. Never enforce a strict CSP on a live site without testing in report-only first; an over-tight policy will break your own scripts.</p>`,
    faq: [
      {
        question: "Will adding security headers break my site?",
        answer:
          "The first three (nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy) are safe in nearly every case. Content-Security-Policy can break things if set too tightly, which is why you always test it in report-only mode before enforcing.",
      },
      {
        question: "My platform won't let me set custom headers. What are my options?",
        answer:
          "Some hosted builders do not expose header settings. The standard workaround is to route your domain through a CDN such as Cloudflare and add the headers there with response-header rules.",
      },
      {
        question: "How do I know the headers are working?",
        answer:
          "Open the browser developer tools, go to the Network tab, click your page request, and read the Response Headers. Or run your URL through a free security-headers scanner for a letter grade.",
      },
    ],
  },
  {
    slug: "optimize-robots-txt-file",
    title: "How to Fix Your robots.txt So You Don't Accidentally Block Google",
    excerpt:
      "One stray line in robots.txt can hide your entire site from search. Here is how to read the file, fix the dangerous mistakes, and keep crawlers focused.",
    category: "Technical SEO",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Optimize robots.txt and Avoid Blocking Your Own Site",
    seoDescription:
      "Read and fix your robots.txt: remove site-wide blocks, keep CSS and JS crawlable, reference your sitemap, and save crawl budget for pages that matter.",
    bodyHtml: `<p>Your robots.txt file tells search engines which paths they may crawl. It is a tiny text file with outsized power: a single wrong line can hide your entire website from Google. Most robots.txt disasters are accidents left over from a staging site, so the fix is usually about removing damage, not adding rules.</p>
<h2>Read it first</h2>
<p>Visit <em>yoursite.com/robots.txt</em>. A 404 here is fine; it simply means "crawl everything." If a file exists, scan for the dangerous patterns:</p>
<ul>
<li><strong>Disallow: /</strong> blocks your whole site. This is the single most damaging line and almost always a mistake.</li>
<li><strong>Disallow rules on CSS, JS, or asset folders</strong> stop Google rendering your pages, which wrecks how it reads your layout and mobile-friendliness.</li>
<li><strong>A missing Sitemap line</strong> means crawlers have to discover your sitemap the hard way.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li><strong>Remove any site-wide block.</strong> Delete <em>Disallow: /</em> unless you genuinely want to be invisible. On some platforms a "discourage search engines" checkbox quietly inserts this; uncheck it.</li>
<li><strong>Keep rendering resources open.</strong> Never block CSS, JavaScript, images, or fonts. Google needs them to see the page the way a visitor does.</li>
<li><strong>Block only low-value paths.</strong> Disallow admin, login, internal search results, and thank-you pages. These create noise and infinite URL variations.</li>
<li><strong>Reference your sitemap.</strong> Add <em>Sitemap: https://yoursite.com/sitemap.xml</em> as an absolute URL.</li>
<li><strong>Test before trusting it.</strong> Use the URL Inspection tool in Search Console on your homepage and a few key pages to confirm they are allowed.</li>
</ol>
<h2>Crawling versus indexing</h2>
<p>An important nuance: robots.txt controls crawling, not indexing. A blocked page with inbound links can still appear in search with no description. To truly keep a page out of results, use a noindex tag on the page rather than a robots.txt block. When in doubt, do not block; Google is good at ignoring low-value pages on its own.</p>`,
    faq: [
      {
        question: "Should every site have a robots.txt file?",
        answer:
          "Not strictly. A missing file means 'crawl everything,' which is fine for many small sites. A file is useful once you want to block admin areas, internal search, or reference your sitemap.",
      },
      {
        question: "I blocked a page in robots.txt but it still shows in Google. Why?",
        answer:
          "robots.txt stops crawling, not indexing. If other sites link to the page, Google may keep it listed without a snippet. Use a noindex tag on the page itself to remove it from results.",
      },
      {
        question: "Is it safe to block my CSS and JavaScript folders?",
        answer:
          "No. Google renders your pages using those files. Block them and Google sees a broken, text-only version of your site, which can hurt rankings and mobile-friendliness checks.",
      },
    ],
  },
  {
    slug: "find-and-fix-broken-links",
    title: "How to Find and Fix Broken Links on Your Website",
    excerpt:
      "Broken links frustrate visitors and tell Google your site is neglected. Here is how to find every dead link and fix it the right way.",
    category: "Technical SEO",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Find and Fix Broken Links (404s) on Your Site",
    seoDescription:
      "A practical guide to finding broken internal and external links, then fixing them with redirects or replacements so you stop losing visitors and crawl budget.",
    bodyHtml: `<p>A broken link is a promise your site fails to keep. The visitor clicks, hits a "page not found," and leaves. Pile up enough of them and search engines read your site as poorly maintained. Broken links are one of the most common audit findings and among the easiest to clear.</p>
<h2>Why it costs you</h2>
<p>Internal broken links waste the authority you have built and dead-end your visitors. External broken links make your content look out of date. Both burn crawl budget that should go to pages you care about.</p>
<h2>Step by step</h2>
<ol>
<li><strong>List every broken link.</strong> Use your audit results, a site crawler, or the "Not found (404)" report in Search Console. Note the broken URL and the page it sits on.</li>
<li><strong>Sort by type.</strong> Split them into internal links (highest priority, fully in your control), external links to other sites, and broken images or files.</li>
<li><strong>Fix internal links first.</strong> If the target page moved, update the link to the new URL or add a 301 redirect from old to new. If it was deleted on purpose, point the link somewhere relevant instead.</li>
<li><strong>Repair external links.</strong> Find the page's new home and update the link, or remove it if the resource is gone for good.</li>
<li><strong>Re-link broken images and files.</strong> Re-upload missing media and correct the path.</li>
<li><strong>Re-scan to confirm.</strong> Run the crawl again and verify the broken-link count dropped to zero.</li>
</ol>
<h2>Stop them coming back</h2>
<p>Most broken links appear when a page is renamed or deleted. Make a habit of adding a redirect whenever you change a URL, and re-crawl your site monthly so new breaks surface before visitors find them.</p>`,
    faq: [
      {
        question: "What is the difference between fixing the link and adding a redirect?",
        answer:
          "If you control the link, update it to point at the correct URL directly; that is cleanest. A redirect is for cases where you cannot update every link, or where outside sites and search engines still reference the old URL.",
      },
      {
        question: "Do broken external links really hurt my SEO?",
        answer:
          "They hurt user experience more than rankings directly, but a site full of dead links signals neglect. Keeping outbound links current is part of looking trustworthy and well maintained.",
      },
      {
        question: "How often should I check for broken links?",
        answer:
          "A monthly crawl is a sensible rhythm for most small sites. Check sooner after any large content change, migration, or URL restructure.",
      },
    ],
  },
  {
    slug: "fix-canonical-url-issues",
    title: "How to Fix Canonical URL Issues and Avoid Duplicate Content",
    excerpt:
      "Canonical tags tell Google which version of a page is the real one. Get them wrong and you split your rankings or de-index good pages. Here is how to fix them.",
    category: "Technical SEO",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Fix Canonical URL Issues (Duplicate Content Guide)",
    seoDescription:
      "Understand canonical tags and fix the common mistakes: missing canonicals, wrong targets, relative or HTTP URLs, and www mismatches.",
    bodyHtml: `<p>A canonical tag is a small line in a page's code that says "this is the master version of this URL." It matters because the same content can live at several addresses: with and without <em>www</em>, with tracking parameters, or as a print version. Canonical tags consolidate those into one, so your ranking signals are not split.</p>
<h2>The common mistakes</h2>
<ul>
<li><strong>Missing canonical:</strong> the page has no tag at all, so search engines guess which version to index.</li>
<li><strong>Wrong target:</strong> the page points at an unrelated URL, which can quietly de-index it.</li>
<li><strong>Relative or HTTP URL:</strong> the tag uses <em>/page</em> instead of the full <em>https://</em> address, sending mixed signals.</li>
<li><strong>www mismatch:</strong> the canonical points to <em>www</em> while the site actually resolves on non-<em>www</em>, or vice versa.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li><strong>Audit your pages.</strong> View source and search for "canonical." You want exactly one tag per page, pointing at the right URL with a 200 status.</li>
<li><strong>Set self-referencing canonicals.</strong> For unique pages (which is most of them), the canonical should point at the page itself.</li>
<li><strong>Use absolute, secure, consistent URLs.</strong> Always full <em>https://</em>, always your chosen domain format, always matching your trailing-slash convention.</li>
<li><strong>Point duplicates at the primary.</strong> URLs with tracking parameters or filter variations should canonical to the clean base URL.</li>
<li><strong>Avoid double tags.</strong> Two canonical tags on one page cancel each other out. If you use an SEO plugin, do not run a second one alongside it.</li>
<li><strong>Confirm in Search Console.</strong> The URL Inspection tool shows which canonical Google actually chose, so you can spot disagreements.</li>
</ol>
<h2>Keep it simple</h2>
<p>Most platforms and SEO plugins generate correct self-referencing canonicals automatically. You only need to step in when you have genuine duplicates to consolidate. Over-engineering canonicals causes more harm than leaving the defaults alone.</p>`,
    faq: [
      {
        question: "What is a self-referencing canonical?",
        answer:
          "It is a canonical tag that points a page at its own URL. This is correct and recommended for unique pages; it confirms to search engines that this URL is the master copy.",
      },
      {
        question: "Can a wrong canonical remove my page from Google?",
        answer:
          "Yes. If a page canonicals to a different, unrelated URL, you are telling Google not to index this page in favour of that one. Pointing canonicals at the wrong target is a real way to lose visibility.",
      },
      {
        question: "Google chose a different canonical than I set. Is that a problem?",
        answer:
          "Sometimes. Google treats your canonical as a strong hint, not a command. If it disagrees, it usually means duplicate or near-duplicate content is confusing it. Differentiate the pages or consolidate them.",
      },
    ],
  },
  {
    slug: "fix-redirect-chains-and-loops",
    title: "How to Fix Redirect Chains and Loops That Slow Your Site",
    excerpt:
      "Redirect chains add hops that slow every page load; loops trap visitors entirely. Here is how to find them and collapse them to single, clean redirects.",
    category: "Technical SEO",
    difficulty: "medium",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "web-vitals",
    seoTitle: "How to Fix Redirect Chains and Redirect Loops",
    seoDescription:
      "Find multi-hop redirect chains and loops, then consolidate them into single 301 redirects to speed up loads and save crawl budget.",
    bodyHtml: `<p>A redirect sends a visitor from one URL to another. That is normal and useful. The problem starts when redirects stack up: A sends to B, B sends to C, C sends to the final page. Every extra hop adds delay and wastes the budget search engines spend crawling your site. A loop is worse, where redirects circle back and the page never loads at all.</p>
<h2>What to look for</h2>
<p>A single hop, such as HTTP to HTTPS, is completely normal and not a problem. The targets worth fixing are chains of three or more hops and any loop. Chains usually build up over years of renaming pages without cleaning up the old redirects.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Trace the chains.</strong> Use your deep-scan results, a redirect-tracing tool, or the browser Network tab, which shows every hop in a request. Write down the starting URL and the final destination.</li>
<li><strong>Collapse each chain.</strong> For a chain A to B to C, create a direct redirect from A straight to C. Remove the intermediate step if nothing else relies on it.</li>
<li><strong>Break loops.</strong> Decide which URL should be the canonical one and delete the redirect that points back.</li>
<li><strong>Always use 301.</strong> Permanent redirects pass ranking value; temporary 302s do not.</li>
<li><strong>Test each fix.</strong> Visit the original URL in a fresh window and confirm it lands on the final page in one hop.</li>
</ol>
<h2>The payoff</h2>
<p>Collapsing chains shaves real time off page loads and stops search engines wasting crawls on hops that should not exist. It is invisible to most visitors but it is exactly the kind of cleanup that compounds across a site.</p>`,
    faq: [
      {
        question: "Are all redirects bad for performance?",
        answer:
          "No. A single redirect, like forcing HTTPS, is normal and fine. The cost comes from chains of multiple hops and from loops. Keep redirects to a single hop wherever you can.",
      },
      {
        question: "Why use 301 instead of 302 redirects?",
        answer:
          "A 301 is permanent and passes ranking value to the destination. A 302 is temporary and tells search engines to keep the original URL indexed. For a page that has genuinely moved, always use 301.",
      },
      {
        question: "Some of my chains involve a third-party service. Can I fix those?",
        answer:
          "Not always. If an external service or shortener adds a hop, you may not control it. Fix the redirects you own first; those are where the gains are, and they are fully in your hands.",
      },
    ],
  },
  {
    slug: "fix-mobile-usability-issues",
    title: "How to Fix Mobile Usability Issues That Are Hurting Your Rankings",
    excerpt:
      "Google ranks on the mobile version of your site. If it is cramped, zoomed out, or hard to tap, your rankings suffer. Here is how to fix the common problems.",
    category: "Mobile",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "mobile",
    seoTitle: "How to Fix Mobile Usability Issues (Mobile-First Guide)",
    seoDescription:
      "Fix the viewport tag, text size, touch targets, and horizontal scrolling so your mobile site passes Google's mobile-first checks and converts.",
    bodyHtml: `<p>Google indexes and ranks your site based on its mobile version, not the desktop one. Most of your visitors are on phones too. So a mobile experience that forces pinch-to-zoom, scrolls sideways, or hides buttons under a thumb is not a minor annoyance; it is a direct drag on rankings and sales.</p>
<h2>Test what visitors actually see</h2>
<p>Open your site, launch the browser developer tools, and switch to mobile view at common widths like 375px and 390px. Run a Lighthouse audit in mobile mode for a structured list. Then walk through your most important pages, not just the homepage.</p>
<h2>The fixes that matter most</h2>
<ol>
<li><strong>Fix the viewport tag.</strong> The single most important line is <em>&lt;meta name="viewport" content="width=device-width, initial-scale=1"&gt;</em> in the page head. Without it, phones render the desktop layout shrunk down. Remove any <em>user-scalable=no</em> or <em>maximum-scale=1</em>, which block zoom and fail accessibility.</li>
<li><strong>Make text readable.</strong> Body text should be at least 16px so nobody has to zoom to read it.</li>
<li><strong>Size touch targets.</strong> Buttons and links need enough room to tap cleanly. Aim for a comfortable target of around 44 to 48px; small, tightly packed links are the most common mobile complaint.</li>
<li><strong>Kill horizontal scrolling.</strong> The page should never scroll sideways. It is usually caused by a fixed-width element or an image wider than the screen. Use responsive widths and constrain media to 100%.</li>
<li><strong>Check the menu and forms.</strong> Make sure the mobile menu opens smoothly and form fields are easy to fill with a thumb.</li>
</ol>
<h2>Confirm the fix</h2>
<p>Re-run Lighthouse and browse the site on a real phone. Mobile fixes often help Core Web Vitals at the same time, since the things that frustrate thumbs also tend to slow pages down.</p>`,
    faq: [
      {
        question: "What is the single most important mobile fix?",
        answer:
          "The viewport meta tag. Without it, phones display your full desktop layout shrunk to fit, forcing visitors to pinch and zoom. It is one line in the page head and it fixes the most jarring mobile problem instantly.",
      },
      {
        question: "How big should buttons be on mobile?",
        answer:
          "Give tap targets enough room that a thumb does not hit the wrong one. Around 44 to 48px is the practical recommendation, with clear spacing between adjacent links.",
      },
      {
        question: "My site looks fine on my phone. Why does Google flag it?",
        answer:
          "Google tests across many devices and screen sizes, and reports site-wide issues you may not hit on your own phone. Use the mobile-usability data in Search Console to see the specific pages and problems it found.",
      },
    ],
  },
  {
    slug: "add-alt-text-to-images",
    title: "How to Write Image Alt Text That Helps Accessibility and SEO",
    excerpt:
      "Alt text describes your images to screen readers and search engines. Missing or vague alt text shuts out visitors and wastes ranking signals. Here is how to do it well.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Write Good Image Alt Text (Accessibility + SEO)",
    seoDescription:
      "Add descriptive, specific alt text to every meaningful image, mark decorative images correctly, and avoid the generic-alt-text trap. WCAG 2.2 guide.",
    bodyHtml: `<p>Alt text is the written description attached to an image. Screen readers read it aloud for people who cannot see the image, and search engines use it to understand what the picture shows. Missing alt text locks out visitors who rely on screen readers; vague alt text like "image" or "IMG_1234" is almost as bad, because it claims to describe the image while saying nothing.</p>
<h2>Why both extremes fail</h2>
<p>An image with no alt text leaves a blind visitor with silence. An image with generic alt text leaves them with noise. WCAG 2.2 expects every meaningful image to carry a real description, and search engines reward the same.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Find images that need attention.</strong> Use your audit, the media library, or a quick scan for missing or generic alt attributes.</li>
<li><strong>Sort by purpose.</strong> Content images (photos that carry meaning), functional images (a logo that is also a link), and decorative images (background flourishes) are handled differently.</li>
<li><strong>Describe what matters.</strong> Write a specific, concise description, usually 5 to 15 words. Name what is in the image and why it is there. Skip "image of" or "photo of"; screen readers already announce it is an image.</li>
<li><strong>Mark decorative images empty.</strong> Use <em>alt=""</em> (an empty value) so screen readers skip purely decorative graphics. Do not invent a description for them.</li>
<li><strong>Keep each description unique.</strong> Ten products should have ten distinct alt texts, not the same line repeated.</li>
<li><strong>Verify.</strong> Re-scan or run a free accessibility checker to confirm nothing meaningful is missing alt text.</li>
</ol>
<h2>A simple test</h2>
<p>Read the alt text aloud with your eyes closed. If you still understand what the image is doing on the page, it is good. If it tells you nothing, rewrite it.</p>`,
    faq: [
      {
        question: "Should every single image have alt text?",
        answer:
          'Every meaningful image should. Purely decorative images should have an empty alt value (alt="") so screen readers skip them. The mistake to avoid is leaving the attribute off entirely, which makes screen readers read the file name.',
      },
      {
        question: "Is keyword-stuffing alt text good for SEO?",
        answer:
          "No. Write a natural, accurate description. If a relevant keyword fits honestly, fine, but stuffing keywords reads as spam to search engines and is useless to screen-reader users.",
      },
      {
        question: "I have hundreds of images. How do I catch up?",
        answer:
          "Prioritise images on high-traffic pages and above the fold first. You can use AI tools to draft descriptions in bulk, but review each one; automated alt text is often generic or wrong.",
      },
    ],
  },
  {
    slug: "add-form-labels-accessibility",
    title: "How to Add Form Labels So Everyone Can Use Your Forms",
    excerpt:
      "Unlabeled form fields are invisible to screen readers and confusing for everyone. Here is how to label inputs properly so your forms actually convert.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add Accessible Labels to Your Website Forms",
    seoDescription:
      "Label every form input with a visible label or aria-label, group related fields, mark required fields in text, and connect error messages. WCAG guide.",
    bodyHtml: `<p>A form field without a label is a guessing game. Sighted visitors might infer what a box is for from a faint placeholder, but screen-reader users hear nothing useful, and the moment they start typing, placeholder text vanishes. Since forms are usually where money changes hands, an unlabeled form is a leaky funnel as well as an accessibility failure.</p>
<h2>Why labels matter</h2>
<p>Labels tell every visitor exactly what each field expects. They also enlarge the clickable area, which helps on mobile, and they satisfy WCAG's requirement that inputs have programmatic names.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Inventory your inputs.</strong> List every field across search boxes, newsletter signups, contact forms, and checkouts.</li>
<li><strong>Add a real label to each field.</strong> Use a visible <em>&lt;label&gt;</em> tied to the input's id. Where the design genuinely cannot show a label, an <em>aria-label</em> is an acceptable fallback. A placeholder alone is not, because it disappears on focus.</li>
<li><strong>Group related fields.</strong> Wrap sets of checkboxes or radio buttons in a fieldset with a legend so their shared question is announced.</li>
<li><strong>Mark required fields in words.</strong> Put "required" in the label text, not just a coloured asterisk that a screen reader may not convey.</li>
<li><strong>Connect error messages.</strong> Link a field to its error text with <em>aria-describedby</em> so the error is read out with the field.</li>
<li><strong>Test it.</strong> Click each label and confirm the matching input gets focus. If it does, the association is correct.</li>
</ol>
<h2>The quick win</h2>
<p>Many form builders have a "show labels" toggle that is simply switched off. Turning it on can fix an entire form in seconds, before you touch any code.</p>`,
    faq: [
      {
        question: "Can I use placeholder text instead of a label?",
        answer:
          "No. Placeholder text disappears as soon as someone starts typing, and many screen readers do not treat it as a reliable label. Use a real label or, at minimum, an aria-label. A placeholder is a hint, not a substitute.",
      },
      {
        question: "Do labels have to be visible?",
        answer:
          "Visible labels are best for everyone. When the design truly cannot show one, an aria-label keeps the field accessible to screen readers. But default to a visible label whenever you can.",
      },
      {
        question: "How do I label a search box that only has a magnifying-glass icon?",
        answer:
          "Add an aria-label such as 'Search' to the input. The icon is visual shorthand; the aria-label gives screen-reader users the same information.",
      },
    ],
  },
  {
    slug: "accessible-names-icon-buttons",
    title: "How to Give Icon Buttons Accessible Names",
    excerpt:
      "Icon-only buttons like the hamburger menu, close X, and search magnifier announce as just 'button' to screen readers. Here is how to name them properly.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add Accessible Names to Icon Buttons and SVGs",
    seoDescription:
      "Give icon-only buttons and SVG icons accessible names with aria-label, hide decorative icons with aria-hidden, and expose toggle state with aria-expanded.",
    bodyHtml: `<p>Plenty of buttons on a modern site are just an icon: the hamburger menu, the close X, the search magnifier, carousel arrows, social icons. To a sighted visitor the meaning is obvious. To a screen reader, an icon button with no text announces as nothing more than "button," and the user has no idea what it does. The same goes for icons built as SVG graphics.</p>
<h2>The two cases</h2>
<p>Every icon falls into one of two buckets. <strong>Interactive</strong> icons (inside a button or link) need a name describing the action. <strong>Decorative</strong> icons (sitting next to text that already explains the action) should be hidden from screen readers so they are not announced twice.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Find icon-only controls.</strong> Look for any button or link whose only content is an icon, with no visible text.</li>
<li><strong>Name the action, not the icon.</strong> Add an <em>aria-label</em> to the button or link describing what it does: "Open menu," "Close dialog," "Search," not "hamburger" or "magnifying glass."</li>
<li><strong>Hide the icon itself.</strong> Add <em>aria-hidden="true"</em> to the icon or SVG inside the button so it is not read separately.</li>
<li><strong>Expose toggle state.</strong> For controls that open and close something, add <em>aria-expanded</em> set to true or false so users know the current state.</li>
<li><strong>Leave decorative icons mute.</strong> An icon next to a text label only needs <em>aria-hidden="true"</em>; the text carries the meaning.</li>
<li><strong>Test with the keyboard.</strong> Tab to each control and confirm it announces a clear, action-based name.</li>
</ol>
<h2>One common mistake</h2>
<p>The accessible name must sit on the clickable element (the button or link), not on the icon inside it. Putting an aria-label on the SVG while leaving the button blank is the usual reason an audit still fails after a "fix."</p>`,
    faq: [
      {
        question: "Where exactly does the aria-label go?",
        answer:
          'On the interactive element itself, the button or link, not on the icon or SVG inside it. The icon should instead get aria-hidden="true" so it is skipped.',
      },
      {
        question: "What about icons that sit next to text?",
        answer:
          'Those are decorative. The visible text already names the action, so the icon just needs aria-hidden="true" to avoid being announced twice.',
      },
      {
        question: "How do I handle a menu button that opens and closes?",
        answer:
          "Give it a clear aria-label like 'Open menu' and add aria-expanded, toggling it between true and false as the menu opens and closes. That tells screen-reader users the current state.",
      },
    ],
  },
  {
    slug: "descriptive-link-text",
    title: "How to Write Link Text That Tells People Where They're Going",
    excerpt:
      "'Click here' and 'read more' are useless to screen readers and weak for SEO. Here is how to write descriptive links that help everyone.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Write Descriptive, Accessible Link Text",
    seoDescription:
      "Replace 'click here' and 'read more' with descriptive link text, fix icon-only and empty links, and improve both accessibility and SEO.",
    bodyHtml: `<p>Screen-reader users often pull up a list of all the links on a page to navigate quickly. In that list, every link that just says "click here," "read more," or "learn more" is meaningless, because the surrounding sentence is gone. Descriptive link text helps those users, and it helps everyone else skim, while giving search engines a clearer signal about what you are linking to.</p>
<h2>What goes wrong</h2>
<ul>
<li><strong>Vague text:</strong> "click here," "read more," "details" tell nobody where the link leads.</li>
<li><strong>Icon-only links:</strong> a link that is just an icon has no text at all.</li>
<li><strong>Empty links:</strong> a linked image with no alt text, or a link with no content, reads as nothing.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li><strong>Find the offenders.</strong> Scan for "click here," "read more," "learn more," "here," and bare icon or image links.</li>
<li><strong>Describe the destination.</strong> Rewrite the visible text to say where the link goes, in a few words: "View our pricing," "Read the full guide to local SEO."</li>
<li><strong>Fix repeating "read more" links.</strong> On a blog list, either link the headline itself or fold the post title into the link so each one is unique.</li>
<li><strong>Give icon links a name.</strong> Add an <em>aria-label</em> to icon-only links describing where they lead.</li>
<li><strong>Give linked images alt text.</strong> A linked image's alt text becomes the link's name, so describe the destination there.</li>
<li><strong>Re-scan.</strong> Confirm no vague or empty links remain.</li>
</ol>
<h2>Why it doubles as SEO</h2>
<p>Search engines read link text as a clue to the target page's topic. "Emergency plumbing services" is a far stronger anchor than "click here." Writing for screen-reader users and writing for search engines pull in the same direction here.</p>`,
    faq: [
      {
        question: "What's wrong with 'click here' if the sentence around it explains the link?",
        answer:
          "Screen-reader users frequently navigate by a flat list of links with no surrounding sentences. In that list, 'click here' is empty of meaning. Descriptive text works in or out of context.",
      },
      {
        question: "How do I handle a blog page full of 'Read more' links?",
        answer:
          "Fix it at the template level rather than post by post. Either make the post headline the clickable link, or include the post title in each 'Read more' link so every one is distinct.",
      },
      {
        question: "Does link text really affect rankings?",
        answer:
          "Yes. Anchor text is a signal search engines use to understand the linked page. Descriptive, relevant link text is more useful than generic phrases for both accessibility and SEO.",
      },
    ],
  },
  {
    slug: "fix-color-contrast",
    title: "How to Fix Low Colour Contrast So Your Text Is Readable",
    excerpt:
      "Light grey text on a white background looks elegant and reads terribly. Here is how to hit the contrast ratios that keep your text legible for everyone.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Fix Colour Contrast Issues (WCAG 2.2 AA)",
    seoDescription:
      "Hit the WCAG 2.2 AA contrast ratios: 4.5:1 for normal text and 3:1 for large text. A practical guide to fixing low-contrast text without wrecking your brand.",
    bodyHtml: `<p>Low colour contrast is the most common accessibility failure on the web, and it usually comes from good intentions: pale grey text looks clean and modern. The trouble is that people with low vision, colour blindness, or simply an aging pair of eyes on a sunny day cannot read it. Contrast is measured as a ratio, and WCAG 2.2 AA sets clear minimums.</p>
<h2>The numbers to hit</h2>
<ul>
<li><strong>Normal text: 4.5:1</strong> contrast against its background.</li>
<li><strong>Large text (18px and up, or 14px bold): 3:1</strong>.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li><strong>Find the failing pairs.</strong> Your audit lists the colour combinations that fall short, with their current ratio.</li>
<li><strong>Test in a contrast checker.</strong> Drop the text and background colours into a free contrast checker to see exactly where you stand.</li>
<li><strong>Adjust to pass.</strong> Darken the text or lighten the background until you clear 4.5:1 for body text. Usually one or two shades darker is enough.</li>
<li><strong>Fix it globally.</strong> Change the colour in your theme settings or CSS variables so every element using that colour updates at once.</li>
<li><strong>Check the easy-to-miss spots.</strong> Placeholder text, disabled buttons, captions, and footer fine print are the usual repeat offenders.</li>
<li><strong>Handle text on images.</strong> Add a dark overlay behind text that sits on a photo so it stays readable regardless of the image.</li>
</ol>
<h2>Keeping your brand</h2>
<p>If a brand colour fails, you rarely have to abandon it. A slightly darker shade of the same hue usually passes while still looking like your brand. Readable is not the enemy of beautiful; unreadable is just unfinished.</p>`,
    faq: [
      {
        question: "What contrast ratio do I actually need?",
        answer:
          "Under WCAG 2.2 AA, normal text needs 4.5:1 against its background and large text (18px or more, or 14px bold) needs 3:1. A free contrast checker tells you whether a colour pair passes.",
      },
      {
        question: "My brand colour fails the test. Do I have to change it?",
        answer:
          "Rarely. A shade or two darker of the same colour usually passes while staying recognisably on-brand. You keep the identity and gain readability.",
      },
      {
        question: "I changed the colour but the audit still fails. Why?",
        answer:
          "Hard-refresh to clear the cache, then check that a more specific CSS rule is not overriding your change, and that you fixed it on both mobile and desktop styles.",
      },
    ],
  },
  {
    slug: "fix-heading-structure",
    title: "How to Fix Heading Structure for Accessibility and SEO",
    excerpt:
      "Headings are the outline of your page. Skipped levels and multiple H1s confuse screen readers and search engines alike. Here is how to get the hierarchy right.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Fix Heading Order and Hierarchy on Your Pages",
    seoDescription:
      "Use one H1 per page and a logical H1-H2-H3 hierarchy with no skipped levels. A guide to heading structure for screen readers and search engines.",
    bodyHtml: `<p>Headings are not just big text; they are the structural outline of your page. Screen-reader users navigate by jumping from heading to heading, and search engines read the hierarchy to understand how your content is organised. When heading levels are skipped or scattered, both audiences get a broken table of contents.</p>
<h2>The rules</h2>
<p>Think of a page like a book outline. There is one title (the H1), major sections (H2s), and subsections under them (H3s). Levels should descend in order without skipping, and the structure should reflect the actual content, not the visual size you happen to want.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Map your current headings.</strong> Your audit shows the heading tree. Look for skipped levels and stray H1s.</li>
<li><strong>Use exactly one H1.</strong> The H1 is the page's main title. More than one muddies the structure.</li>
<li><strong>Stop skipping levels.</strong> An H1 should be followed by H2, not H3. If you jumped a level, demote the heading to the right one.</li>
<li><strong>Match levels to meaning.</strong> An H2 is a main section; an H3 belongs under an H2 as a subsection. Order them the way the content actually nests.</li>
<li><strong>Change the level, not the look.</strong> Heading level and font size are independent. If a correctly-levelled heading now looks too big or small, style it with CSS; do not change the tag back.</li>
<li><strong>Re-scan.</strong> Confirm no skipped-level warnings remain.</li>
</ol>
<h2>Why it is worth it</h2>
<p>Clean heading structure makes your page easier to skim for sighted readers, navigable for screen-reader users, and clearer for search engines trying to understand your topic. It is one change that pays off for all three at once.</p>`,
    faq: [
      {
        question: "Can a page have more than one H1?",
        answer:
          "Stick to one. The H1 is the page's main title, and a single clear H1 is best for both screen readers and search engines. Use H2s and H3s for everything beneath it.",
      },
      {
        question: "Changing an H4 to an H2 makes the text huge. How do I keep the size?",
        answer:
          "Heading level and visual size are separate concerns. Change the tag for correct structure, then use a CSS class to control how big it looks. The two do not have to move together.",
      },
      {
        question: "Do headings actually affect SEO?",
        answer:
          "Yes. Search engines use heading structure to understand what a page is about and how it is organised. A logical hierarchy helps them, and helps human readers skim, at the same time.",
      },
    ],
  },
  {
    slug: "add-html-lang-attribute",
    title: "How to Set the Language Attribute on Your Website",
    excerpt:
      "A single missing attribute can make screen readers mispronounce your whole site. Here is the two-minute fix that tells browsers what language your pages are in.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "3 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add the lang Attribute to Your HTML",
    seoDescription:
      'Set lang="en" (or your language) on the html tag so screen readers pronounce text correctly. A quick, one-time accessibility fix.',
    bodyHtml: `<p>This is one of the fastest accessibility fixes there is, and one of the most overlooked. The <em>lang</em> attribute on your page's <em>&lt;html&gt;</em> tag tells browsers and assistive technology what language the content is in. Leave it off and a screen reader may apply the wrong pronunciation rules, reading your English text with, say, French phonetics. It is jarring and hard to follow.</p>
<h2>Why it matters</h2>
<p>Beyond pronunciation, the language attribute affects browser spell-check, automatic translation prompts, and proper hyphenation. It is a small signal with a wide reach, and WCAG requires it.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Check the current value.</strong> View your page source and look at the opening <em>&lt;html&gt;</em> tag. You want something like <em>&lt;html lang="en"&gt;</em>. Note if it is missing, empty, or wrong.</li>
<li><strong>Add the right code.</strong> Set <em>lang</em> to your primary language: <em>en</em> for English, <em>es</em> for Spanish, <em>fr</em> for French, and so on. Use a valid code, not a word like "english."</li>
<li><strong>Handle mixed-language content.</strong> If a section is in another language, add a <em>lang</em> attribute to that section while the page-level <em>lang</em> stays on your main language.</li>
<li><strong>Verify across pages.</strong> This is set once in your template and applies everywhere, so checking two or three pages confirms the whole site.</li>
</ol>
<h2>Set and forget</h2>
<p>Because it lives in the shared template, you fix this once and never think about it again. Few accessibility wins are this cheap.</p>`,
    faq: [
      {
        question: "What value should I use for English?",
        answer:
          'Use lang="en" for English generally, or a regional variant like lang="en-US" or lang="en-GB" if you want to be specific. Use valid language codes, never a spelled-out word like "english."',
      },
      {
        question: "Do I have to add this to every page?",
        answer:
          "No. It lives in your shared HTML template, so setting it once applies it site-wide. Just confirm it appears in the source on a couple of pages.",
      },
      {
        question: "My site is bilingual. How do I handle that?",
        answer:
          "Set the html tag to your primary language, then add a lang attribute to any block of content written in the other language. That way each section is announced correctly.",
      },
    ],
  },
  {
    slug: "add-iframe-titles",
    title: "How to Add Titles to Embedded Maps, Videos, and Forms",
    excerpt:
      "Embedded content like maps and videos sits in iframes. Without a title, screen-reader users have no idea what they are about to enter. Here is the fix.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "3 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add Accessible Titles to iframes (Maps, Videos, Forms)",
    seoDescription:
      "Add a descriptive title attribute to every iframe so screen readers announce what the embedded map, video, or form contains before users enter it.",
    bodyHtml: `<p>When you embed a Google Map, a YouTube video, a booking form, or a chat widget, it usually arrives as an <em>iframe</em>, a window into another page. To a screen-reader user, an iframe with no title is a black box: they cannot tell what is inside before tabbing into it. A one-line title attribute solves it.</p>
<h2>Why it matters</h2>
<p>The title is announced before focus moves into the embedded content, so the user knows whether it is the map to your office, a how-to video, or a contact form. It is a small courtesy that makes embedded content navigable.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Find every iframe.</strong> Look for embedded maps, videos, booking tools, forms, and chat widgets across your pages.</li>
<li><strong>Add a descriptive title.</strong> Set a <em>title</em> attribute on each iframe that says what it contains: <em>title="Map showing our Buffalo office"</em> or <em>title="Video: how our service works"</em>.</li>
<li><strong>Keep titles unique.</strong> If you embed several videos or maps, each one needs its own specific title, not a repeated label.</li>
<li><strong>Avoid generic labels.</strong> "Embedded content" or "iframe" tells nobody anything. Name the actual content.</li>
<li><strong>Re-scan.</strong> Confirm no iframe-title warnings remain.</li>
</ol>
<h2>Where to add it</h2>
<p>Most embed codes you copy from a service do not include a title; you simply add one to the iframe tag yourself. Even YouTube's default "YouTube video player" is worth replacing with the specific video title.</p>`,
    faq: [
      {
        question: "The embed code I copied has no title. Do I add it myself?",
        answer:
          'Yes. Most services hand you an iframe without a title attribute. Paste the embed code, then add a title="..." attribute to the iframe describing what it shows. It is a manual one-line addition.',
      },
      {
        question: "What should the title actually say?",
        answer:
          "Describe the content specifically: 'Map showing our office,' 'Video: product walkthrough,' 'Appointment booking form.' Avoid generic labels like 'embedded content.'",
      },
      {
        question: "A third-party widget injects an iframe I can't edit. What then?",
        answer:
          "Some widgets, like chat tools, inject their own iframe and you may not control its markup. Check the widget's settings for an accessibility or label option; otherwise it is the vendor's responsibility, not a flaw in your page you can fix.",
      },
    ],
  },
  {
    slug: "fix-invalid-aria-roles",
    title: "How to Fix Invalid ARIA Roles on Your Website",
    excerpt:
      "A misspelled or made-up ARIA role is silently ignored, leaving screen-reader users without the cues you meant to give them. Here is how to correct them.",
    category: "Accessibility",
    difficulty: "medium",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Fix Invalid ARIA Roles (Accessibility Guide)",
    seoDescription:
      "Identify and correct misspelled or non-existent ARIA roles, replace made-up roles, and prefer native HTML elements over div-plus-role.",
    bodyHtml: `<p>ARIA roles are labels you can add to elements to tell assistive technology what they are, such as a button, a navigation region, or a dialog. They are powerful, but only when valid. A misspelled role like <em>navigtion</em>, or an invented one like <em>container</em>, is simply ignored by screen readers, so the cue you intended to provide never reaches the user.</p>
<h2>The usual culprits</h2>
<ul>
<li><strong>Typos:</strong> <em>buton</em>, <em>navigtion</em>, <em>complimentary</em> instead of <em>complementary</em>.</li>
<li><strong>Made-up roles:</strong> <em>container</em>, <em>card</em>, <em>content</em>, which are not real ARIA roles.</li>
<li><strong>Abstract roles:</strong> <em>widget</em>, which exists in the spec but is not meant to be used directly.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li><strong>Find the invalid roles.</strong> Your audit, or a tool like the axe browser extension, lists them.</li>
<li><strong>Correct the typos.</strong> Fix the spelling against the official ARIA role list (MDN keeps the authoritative reference).</li>
<li><strong>Remove invented roles.</strong> A made-up role adds nothing; delete it, or replace it with the correct real role.</li>
<li><strong>Prefer native elements.</strong> Instead of <em>&lt;div role="button"&gt;</em>, use an actual <em>&lt;button&gt;</em>. Native elements come with the right role, keyboard behaviour, and focus handling for free.</li>
<li><strong>Use specific roles, not abstract ones.</strong> Replace <em>widget</em> with the precise role the element actually plays.</li>
<li><strong>Re-test.</strong> Run the accessibility checker again to confirm no invalid roles remain.</li>
</ol>
<h2>The golden rule</h2>
<p>The best ARIA is often no ARIA. If a native HTML element does the job, use it; reach for a role only when you are building something HTML has no element for. Fewer custom roles means fewer chances to get them wrong.</p>`,
    faq: [
      {
        question: "What makes an ARIA role 'invalid'?",
        answer:
          "Either it is misspelled (like 'navigtion'), it is not a real role at all (like 'container' or 'card'), or it is an abstract role not meant for direct use (like 'widget'). Screen readers ignore any of these.",
      },
      {
        question: "Should I use div-plus-role or a native element?",
        answer:
          "Prefer the native element. A real button or nav brings the correct role, keyboard support, and focus behaviour automatically. Recreating that with a div and a role is more work and more error-prone.",
      },
      {
        question: "I added an aria-label but the audit still flags the role. Why?",
        answer:
          "An aria-label does not fix an invalid role; they are separate things. Correct or remove the invalid role first, then the label will work as intended on a valid element.",
      },
    ],
  },
  {
    slug: "add-main-landmark",
    title: "How to Add a Main Landmark So Visitors Can Skip to Your Content",
    excerpt:
      "A main element lets screen-reader users jump straight past your header and navigation to the real content. Here is how to add it without breaking your layout.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "4 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add a Main Landmark Element to Your Pages",
    seoDescription:
      "Wrap your primary content in a single main element so screen-reader users can jump to it directly, bypassing header, navigation, and sidebars.",
    bodyHtml: `<p>Screen readers offer a shortcut to jump straight to the main content of a page, but only if you tell them where it is. The <em>&lt;main&gt;</em> element marks the primary content region, the part that is unique to this page, as opposed to the header, navigation, and footer that repeat everywhere. Without it, a screen-reader user has to tab through your entire menu on every single page.</p>
<h2>Why it matters</h2>
<p>Imagine arriving on each new page and being forced to listen to the whole navigation again before reaching the article. The main landmark removes that, and it costs you one element.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Find the content wrapper.</strong> Identify the element that holds this page's unique content, not the header, nav, sidebar, or footer.</li>
<li><strong>Make it a main element.</strong> Change that wrapper's tag to <em>&lt;main&gt;</em>, or wrap the content in a <em>&lt;main&gt;</em>.</li>
<li><strong>Use only one per page.</strong> A page should have exactly one main landmark. Remove any extras from sidebars or widgets.</li>
<li><strong>Do not nest it wrongly.</strong> The main element should not sit inside the header or nav.</li>
<li><strong>Pair it with your skip link.</strong> Give it an id and a <em>tabindex="-1"</em> so a "skip to content" link can move focus into it.</li>
<li><strong>Confirm the layout is unchanged.</strong> Main is a plain block element like a div, so swapping the tag should not move anything visually.</li>
</ol>
<h2>If the layout shifts</h2>
<p>If changing a div to main breaks styling, the cause is almost always a CSS rule targeting the div by tag name. Adjust the selector to target the id or class instead, and the layout returns while the accessibility win stays.</p>`,
    faq: [
      {
        question: "Can I have more than one main element?",
        answer:
          "No. Use exactly one main landmark per page, wrapping the primary content. Remove any extra main elements from sidebars or plugin widgets so the shortcut lands in the right place.",
      },
      {
        question: "Will switching a div to main change how my page looks?",
        answer:
          "It should not. Main is a block-level element just like div. If styling breaks, a CSS rule is targeting the old div tag directly; change it to target the id or class instead.",
      },
      {
        question: "How does main work with a skip link?",
        answer:
          "Give the main element an id and a tabindex of -1, then point your 'skip to content' link at that id. Activating the link moves keyboard focus straight into the main content.",
      },
    ],
  },
  {
    slug: "add-skip-navigation-link",
    title: "How to Add a Skip Navigation Link for Keyboard Users",
    excerpt:
      "A skip link lets keyboard users bypass your menu and jump to the content. It is one of the simplest accessibility wins and it is required by WCAG. Here is how.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "4 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add a 'Skip to Content' Link to Your Website",
    seoDescription:
      "Add a skip-navigation link that keyboard users can tab to and activate, bypassing repeated navigation to reach the main content. WCAG 2.4.1 guide.",
    bodyHtml: `<p>People who navigate with a keyboard instead of a mouse press Tab to move through a page. Without help, that means tabbing through every navigation link before they ever reach the content, on every page. A skip link, the first thing they can tab to, lets them jump straight to the main content. It is one of the cheapest accessibility fixes and WCAG requires it.</p>
<h2>How it works</h2>
<p>The skip link is hidden until a keyboard user tabs to it, at which point it appears at the top of the page. Pressing Enter moves focus into the main content, past the menu. Mouse users never see it; keyboard users get a shortcut.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Add the link first.</strong> Place a "Skip to main content" link as the very first element after the opening body tag, pointing at your main content's id.</li>
<li><strong>Hide it until focused.</strong> Style it off-screen by default and bring it into view on focus. Do not use <em>display:none</em>, which would hide it from keyboards and screen readers too; position it off-screen instead.</li>
<li><strong>Target the main content.</strong> Make sure the destination element has the matching id and a <em>tabindex="-1"</em> so focus lands there.</li>
<li><strong>Test with Tab.</strong> Load the page and press Tab once. The skip link should appear at the top.</li>
<li><strong>Test with Enter.</strong> Press Enter and confirm focus jumps into the main content, skipping the navigation.</li>
<li><strong>Check across browsers.</strong> Verify it behaves the same in the major browsers.</li>
</ol>
<h2>The common gotcha</h2>
<p>If pressing Enter does not move focus, the target element is missing its <em>tabindex="-1"</em>. Add it to the main content wrapper and the jump works.</p>`,
    faq: [
      {
        question: "Will the skip link be visible to normal visitors?",
        answer:
          "No. It is hidden off-screen until a keyboard user tabs to it, when it appears at the top of the page. Mouse users never notice it, so it does not affect your design.",
      },
      {
        question: "Why not just hide the skip link with display:none?",
        answer:
          "display:none removes it from keyboard and screen-reader access too, defeating the purpose. Hide it by positioning it off-screen instead, and reveal it on focus.",
      },
      {
        question: "My skip link shows but Enter doesn't jump anywhere. What's wrong?",
        answer:
          'The target element needs a tabindex of -1 so it can receive focus. Add tabindex="-1" to your main content wrapper and the skip link will move focus there.',
      },
    ],
  },
  {
    slug: "add-table-headers",
    title: "How to Add Proper Table Headers for Accessible Data Tables",
    excerpt:
      "A data table without header cells is just a stream of numbers to a screen reader. Here is how to mark up tables so the data makes sense to everyone.",
    category: "Accessibility",
    difficulty: "easy",
    readingTime: "4 min",
    updatedAt: "2026-06-21",
    fixesSlug: "a11y",
    seoTitle: "How to Add Header Cells to Accessible Data Tables",
    seoDescription:
      "Mark data-table headers with th and scope attributes, use thead and tbody, and add a caption so screen readers can announce row and column context.",
    bodyHtml: `<p>Tables are how we present comparisons, pricing, schedules, and specifications. A sighted reader scans across rows and down columns effortlessly. A screen-reader user moves cell by cell, and without proper header markup, each cell is just a value with no context: "199" with no idea which plan or which month it belongs to. Header cells restore that context.</p>
<h2>Layout tables versus data tables</h2>
<p>This applies to genuine data tables. If a table is only used to position elements visually, it should not be a table at all. For real data, the fix is straightforward.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Identify data tables.</strong> Pricing tables, comparison grids, schedules, and spec sheets all qualify.</li>
<li><strong>Mark the column headers.</strong> Change the top row's cells from <em>&lt;td&gt;</em> to <em>&lt;th scope="col"&gt;</em>.</li>
<li><strong>Mark the row headers.</strong> If the first column labels each row, change those cells to <em>&lt;th scope="row"&gt;</em>.</li>
<li><strong>Group the sections.</strong> Wrap the header row in <em>&lt;thead&gt;</em> and the data rows in <em>&lt;tbody&gt;</em>.</li>
<li><strong>Add a caption.</strong> A <em>&lt;caption&gt;</em> gives the table a title that is announced up front.</li>
<li><strong>Test.</strong> With a screen reader, moving between cells should announce the relevant column and row headers alongside each value.</li>
</ol>
<h2>The result</h2>
<p>Now "199" is announced as "Pro plan, monthly price, 199." The numbers carry their meaning with them, and the table is usable by everyone.</p>`,
    faq: [
      {
        question: "What does the scope attribute do?",
        answer:
          'scope tells screen readers whether a header cell labels a column (scope="col") or a row (scope="row"). That association is what lets the reader announce the right header alongside each data cell.',
      },
      {
        question: "Does this apply to tables I only use for layout?",
        answer:
          "No. Tables used purely to position elements should not be data tables at all; modern CSS handles layout. Header markup is for genuine data tables: pricing, schedules, comparisons, and specs.",
      },
      {
        question: "My CMS won't let me add th elements. What can I do?",
        answer:
          "Switch to the HTML or code view of the table and edit the markup directly. If the table is built from div elements rather than real table tags, either rebuild it as a proper table or add table ARIA roles to the divs.",
      },
    ],
  },
  {
    slug: "improve-thin-content-pages",
    title: "How to Fix Thin Content and Build Pages That Actually Rank",
    excerpt:
      "Thin, shallow pages do not rank and do not convince. Here is how to find them and decide whether to expand, merge, or remove each one.",
    category: "Content",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    seoTitle: "How to Fix Thin Content Pages (Expand, Merge, or Remove)",
    seoDescription:
      "Find thin content, then expand the valuable pages, merge the overlapping ones, and remove or noindex the rest so your site reads as substantial to Google.",
    bodyHtml: `<p>Thin content is a page that does not say enough to be useful, to a reader or to a search engine. A service page with two sentences, a location page that is a near-copy of five others, an empty tag archive: these pages dilute your site. Google increasingly rewards depth and demotes filler, so the cure is partly writing more and partly cutting what should not exist.</p>
<h2>Why it costs you</h2>
<p>Thin pages rarely rank, rarely convert, and quietly drag on how Google judges the whole site. Every weak page is crawl budget spent on something that does not earn it.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Audit your thin pages.</strong> List the pages flagged as thin, then decide a verb for each: expand, merge, noindex, or delete.</li>
<li><strong>Expand the valuable ones.</strong> For pages worth keeping, answer the real questions a buyer has: what the service is, how it works, what to expect, what affects pricing, and a short FAQ. Aim for genuine substance, often 500 to 1,000 words, written for the reader rather than a word count.</li>
<li><strong>Merge the overlapping ones.</strong> If several thin pages cover almost the same thing, combine them into one strong page and 301-redirect the old URLs to it.</li>
<li><strong>Differentiate near-duplicates.</strong> Location or service pages that read identically should each carry unique detail: specific examples, local references, real photos.</li>
<li><strong>Noindex or remove the dead weight.</strong> Thank-you pages and empty archives can be noindexed. Pages with no purpose can be removed and redirected.</li>
<li><strong>Update and re-submit.</strong> Refresh your sitemap, then request re-indexing on the pages you improved.</li>
</ol>
<h2>What to write about</h2>
<p>If you are stuck on what to add, look at the "People also ask" box and related searches for your topic, and answer those questions directly. Your sales conversations are another goldmine: the questions customers actually ask are the content the page is missing. Give it four to twelve weeks for rankings to respond.</p>`,
    faq: [
      {
        question: "Is there a word count that counts as 'thin'?",
        answer:
          "There is no hard threshold, but pages under a few hundred words often signal thinness. The real test is whether the page fully answers what a visitor came to learn. Depth and usefulness matter more than a number.",
      },
      {
        question: "Should I delete thin pages or expand them?",
        answer:
          "It depends on the page. Expand pages that have a real purpose and some traffic. Merge pages that overlap. Delete or noindex pages that exist for no good reason. Match the action to the page.",
      },
      {
        question: "I expanded my pages but rankings haven't moved. How long does it take?",
        answer:
          "Give it four to twelve weeks. Google has to recrawl and reassess, and competition matters too. Confirm your technical SEO is sound and that the new content genuinely answers the search intent.",
      },
    ],
  },
  {
    slug: "fix-orphan-pages",
    title: "How to Fix Orphan Pages That Google Never Finds",
    excerpt:
      "An orphan page has no internal links pointing to it, so it rarely gets crawled or ranked. Here is how to reconnect them and recover lost traffic.",
    category: "Content",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    seoTitle: "How to Find and Fix Orphan Pages (Internal Linking Guide)",
    seoDescription:
      "Find pages with no internal links and reconnect them with contextual links, hub pages, and navigation so they get crawled, indexed, and ranked.",
    bodyHtml: `<p>An orphan page is a page nothing on your site links to. It might be a perfectly good blog post or service page, but because no internal link points to it, search engines struggle to find it and visitors never stumble across it. The content exists; the path to it does not. Reconnecting orphans is one of the highest-return internal-linking fixes there is.</p>
<h2>Why it matters</h2>
<p>Internal links are how authority flows through your site and how crawlers discover pages. An orphan gets none of that. Linking it back in can surface traffic that was sitting there unused.</p>
<h2>Step by step</h2>
<ol>
<li><strong>List the orphans.</strong> Your audit flags pages with zero internal links. For each, note whether it has traffic, backlinks, or keyword potential.</li>
<li><strong>Decide its fate.</strong> Keep and link the valuable ones, redirect ones that overlap a stronger page, noindex pure utility pages, and delete the genuinely worthless.</li>
<li><strong>Add contextual links.</strong> From related, already-indexed pages, add two or three in-content links to each orphan you are keeping, using descriptive anchor text.</li>
<li><strong>Build hub pages.</strong> When several orphans share a theme, create a pillar page that links out to all of them and pulls them into your structure.</li>
<li><strong>Use navigation and breadcrumbs.</strong> Add important reconnected pages to menus or breadcrumb trails so they are reachable in a click or two.</li>
<li><strong>Re-scan.</strong> Confirm no unintentional orphans remain.</li>
</ol>
<h2>Prevent the next batch</h2>
<p>Orphans usually appear when content is published without anyone linking to it. A simple publishing checklist, "link this from at least two relevant pages," stops new orphans before they form. A link only helps if the linking page is itself indexed and the link is real HTML, not generated by script that crawlers may not run.</p>`,
    faq: [
      {
        question: "What exactly makes a page an 'orphan'?",
        answer:
          "It has no internal links pointing to it from anywhere on your site. Visitors can only reach it by typing the URL directly or via an external link, which means search engines have a hard time discovering it.",
      },
      {
        question: "How many internal links does an orphan need?",
        answer:
          "Two or three contextual links from relevant, indexed pages is a solid baseline. Links from your navigation, a hub page, or breadcrumbs help too. The goal is for the page to sit naturally within your site's structure.",
      },
      {
        question: "I linked to an orphan but it still shows as orphaned. Why?",
        answer:
          "Check that the linking page is itself indexed and not blocked, and that the link is in the raw HTML rather than added by JavaScript that crawlers may not execute. Both are common reasons a link does not register.",
      },
    ],
  },
  {
    slug: "improve-internal-linking",
    title: "How to Improve Internal Linking So Every Page Pulls Its Weight",
    excerpt:
      "Internal links spread authority and guide visitors to the next step. Pages with few links are dead ends. Here is how to link your site like a pro.",
    category: "Content",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    seoTitle: "How to Improve Internal Linking on Your Website",
    seoDescription:
      "Add contextual internal links to dead-end pages, use descriptive anchor text, and guide both crawlers and visitors with a deliberate linking structure.",
    bodyHtml: `<p>Internal links are the connective tissue of your site. They pass authority from strong pages to others, they help search engines discover and understand your content, and they guide visitors to the logical next step. A page with no outbound internal links is a dead end: the visitor reads it and has nowhere obvious to go, and the page hoards whatever authority it has instead of sharing it.</p>
<h2>What good linking does</h2>
<p>Every internal link is a recommendation. It tells crawlers "this page matters" and tells readers "here is what to look at next." A deliberate linking structure lifts the whole site, not just one page.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Find the dead ends.</strong> Your audit flags pages with few or no outbound internal links. These are the priority.</li>
<li><strong>Add two to five contextual links per page.</strong> Inside the body content, link to genuinely related pages where it helps the reader, not as an afterthought stuffed at the bottom.</li>
<li><strong>Use descriptive anchor text.</strong> Link the words that describe the destination ("our roof repair service"), not "click here." It helps readers and search engines both.</li>
<li><strong>Point to your important pages often.</strong> The pages you most want to rank should receive the most internal links.</li>
<li><strong>Use structural links too.</strong> Navigation, footers, related-content sections, and breadcrumbs all add reliable links, but they do not replace in-content links.</li>
<li><strong>Re-check.</strong> Confirm no page is left a dead end and that linking scores improve.</li>
</ol>
<h2>How to choose links</h2>
<p>The simplest test: as you read a page, ask what the visitor would naturally want to learn or do next, and link to that. Links that serve the reader almost always serve SEO too.</p>`,
    faq: [
      {
        question: "How many internal links should a page have?",
        answer:
          "Aim for two to five contextual links within the body content of a typical page, pointing to genuinely related pages. The exact number matters less than the links being relevant and useful to the reader.",
      },
      {
        question: "Do navigation links count toward internal linking?",
        answer:
          "They help, but they are not enough on their own. Site-wide nav and footer links are repetitive and carry less weight than contextual links inside your content. Add in-content links as well.",
      },
      {
        question: "What anchor text should I use for internal links?",
        answer:
          "Descriptive text that names the destination, like 'our pricing page' or 'local SEO guide.' Avoid generic phrases like 'click here'; descriptive anchors help both visitors and search engines understand the link.",
      },
    ],
  },
  {
    slug: "fix-soft-404-errors",
    title: "How to Fix Soft 404 Errors and Save Your Crawl Budget",
    excerpt:
      "A soft 404 is a page that says 'not found' but reports success to Google. That mixed signal wastes crawl budget. Here is how to clean them up.",
    category: "Technical SEO",
    difficulty: "medium",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Fix Soft 404 Errors on Your Website",
    seoDescription:
      "Resolve soft 404s by redirecting moved content, adding real content to thin pages, and returning proper 404 status codes for pages that are truly gone.",
    bodyHtml: `<p>A soft 404 is a contradiction. The page tells the visitor "this content does not exist," but the server quietly reports a 200 "OK, here is your page" status to search engines. Google sees the mismatch, gets confused about your site's quality, and wastes crawl budget revisiting pages that have nothing to offer. The fix is to make the signal match the reality.</p>
<h2>Where soft 404s come from</h2>
<p>Usually from deleted content that still loads an empty shell, empty internal search results, thin placeholder pages, or moved pages that were never redirected. Each one looks like a real page to the server but a dead end to the visitor.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Find them.</strong> Your audit and Search Console both report soft 404s. Group them by cause: deleted, empty, thin, or moved.</li>
<li><strong>Redirect moved content.</strong> If the content lives elsewhere now, 301-redirect the old URL to the new one.</li>
<li><strong>Fix thin pages.</strong> If the page should exist but is empty, give it real content so it earns its place.</li>
<li><strong>Return a true 404.</strong> For content that is genuinely gone, make the server return an actual 404 status, not a 200 with a "not found" message.</li>
<li><strong>Build a helpful 404 page.</strong> Your real 404 page should offer a search box, links to key pages, and navigation so a lost visitor can recover.</li>
<li><strong>Verify status codes.</strong> Confirm each URL now returns the correct code, then re-scan to watch the soft-404 count fall.</li>
</ol>
<h2>The principle</h2>
<p>Honesty in status codes is the whole game. A page that is gone should say 404. A page that moved should say 301. A page that exists should say 200 and actually have content. Match the signal to the truth and the confusion disappears.</p>`,
    faq: [
      {
        question: "What is the difference between a soft 404 and a real 404?",
        answer:
          "A real 404 returns a 'not found' status code, which is correct for missing pages. A soft 404 shows 'not found' content to the visitor but returns a 200 'success' code to search engines, creating a confusing mismatch.",
      },
      {
        question: "My custom 404 page returns a 200 status. Is that wrong?",
        answer:
          "Yes. A 'not found' page should return an actual 404 status code. If a theme or plugin is serving it with a 200, that is exactly what creates soft 404s. Make sure the proper status header is sent.",
      },
      {
        question: "I fixed them but Google still reports soft 404s. Why?",
        answer:
          "Google needs to recrawl before the reports update, which can take one to four weeks. You can speed up key pages with the URL Inspection tool's 'Request Indexing' option.",
      },
    ],
  },
  {
    slug: "set-up-google-analytics-4",
    title: "How to Set Up Google Analytics 4 and Actually See Your Traffic",
    excerpt:
      "Without analytics you are guessing about what works. Here is how to set up GA4, confirm it is tracking, and mark the actions that matter.",
    category: "Analytics",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Set Up Google Analytics 4 (GA4) on Your Website",
    seoDescription:
      "Create a GA4 property, install the tracking code, confirm data in the Realtime report, and mark key actions as conversions. A clear setup guide for 2026.",
    bodyHtml: `<p>If you do not have analytics installed, you are running your website blind. You cannot tell which pages bring in customers, which marketing channels are worth the money, or whether a change helped or hurt. Google Analytics 4, or GA4, is free and is now the standard; the old Universal Analytics was fully retired in 2024, so GA4 is what you set up today.</p>
<h2>What GA4 gives you</h2>
<p>It shows where visitors come from, what they do on your site, and which actions they take. With it, you can stop guessing and start spending your time and budget where they actually pay off.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Create a GA4 property.</strong> Sign in at analytics.google.com and create an account and a property for your site. It is free.</li>
<li><strong>Set up a web data stream.</strong> Add your website as a data stream and leave Enhanced Measurement on, which automatically tracks scrolls, outbound clicks, file downloads, and more.</li>
<li><strong>Install the tag.</strong> Copy your Measurement ID (it looks like <em>G-XXXXXXXXXX</em>) and add the tracking code to every page, via your platform's analytics field, an SEO plugin, or Google Tag Manager.</li>
<li><strong>Confirm it works.</strong> Open the Realtime report, browse your own site in another tab, and check that you appear as an active user with page-view events.</li>
<li><strong>Mark conversions.</strong> Flag the actions that matter, such as form submissions and phone-number clicks, as key events so you can measure real outcomes, not just visits.</li>
<li><strong>Give it time.</strong> Standard reports populate over 24 to 48 hours; Realtime is instant for confirming the install.</li>
</ol>
<h2>Note on terminology</h2>
<p>GA4 renamed "conversions" to "key events" in 2024, though you will still see "conversion" language in places tied to Google Ads. They refer to the same idea: the actions you have decided are worth measuring.</p>`,
    faq: [
      {
        question: "Is Universal Analytics still an option?",
        answer:
          "No. Universal Analytics (the old UA-XXXXX properties) stopped processing data and was fully removed in 2024. GA4, with its G-XXXXXXXXXX Measurement ID, is the only current version of Google Analytics.",
      },
      {
        question: "My Realtime report shows zero users. What's wrong?",
        answer:
          "Confirm the tracking code is actually on the page by viewing the source and searching for 'gtag,' disable any ad blocker, and test in an incognito window. Ad blockers and a missing tag are the usual causes.",
      },
      {
        question: "Why does my data look incomplete?",
        answer:
          "Allow 24 to 48 hours for standard reports to process, make sure the tag is on every page rather than just the homepage, and expect ad blockers to filter a portion of visits. Some gap is normal.",
      },
    ],
  },
  {
    slug: "set-up-google-search-console",
    title: "How to Set Up Google Search Console and Watch Your Search Traffic",
    excerpt:
      "Search Console is the free dashboard that shows how Google sees your site. Here is how to set it up, verify it, and use it to catch problems early.",
    category: "Analytics",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Set Up Google Search Console (Step by Step)",
    seoDescription:
      "Add and verify your site in Google Search Console, submit your sitemap, and use the Performance and Pages reports to monitor indexing and rankings.",
    bodyHtml: `<p>Google Search Console is the free tool that shows you your website from Google's side of the glass: which search queries bring people in, which pages are indexed, and what technical problems Google has run into. Without it, a ranking drop or an indexing failure can go unnoticed for weeks while your traffic quietly bleeds. With it, you get alerts and data.</p>
<h2>Why it is non-negotiable</h2>
<p>Analytics tells you what visitors do once they arrive. Search Console tells you how they find you and whether Google can even read your site. You want both, and Search Console is free.</p>
<h2>Step by step</h2>
<ol>
<li><strong>Add your site.</strong> Go to search.google.com/search-console and add your property. The URL-prefix option is the simplest; enter your exact site URL, minding www versus non-www.</li>
<li><strong>Verify ownership.</strong> If you already use GA4 on the same Google account, verification is often instant. Otherwise use the HTML meta tag, a DNS record, or a file upload.</li>
<li><strong>Submit your sitemap.</strong> In the Sitemaps section, submit your sitemap URL so Google has a clean list of your pages.</li>
<li><strong>Read the key reports.</strong> Performance shows the queries and pages bringing in clicks; Pages shows indexing status; the Experience and Core Web Vitals data flags speed and usability issues.</li>
<li><strong>Turn on alerts.</strong> Make sure email notifications are on so you hear about indexing errors and manual actions promptly.</li>
<li><strong>Give it a few days.</strong> Data starts appearing within two to three days of verification.</li>
</ol>
<h2>How to use it</h2>
<p>Check it monthly at least. The Performance report tells you which terms you are close to ranking for, the Pages report tells you what Google refused to index and why, and the alerts catch the problems that matter before they cost you traffic.</p>`,
    faq: [
      {
        question: "Do I need Search Console if I already have analytics?",
        answer:
          "Yes, they do different jobs. Analytics shows what visitors do on your site; Search Console shows how Google finds and indexes it and flags technical problems. Both are free and they complement each other.",
      },
      {
        question: "My verification keeps failing. What should I check?",
        answer:
          "View your page source to confirm the verification code is actually live, make sure a meta tag sits in the head rather than the body, and remember DNS changes can take 24 to 48 hours to propagate. Using the same Google account as GA4 often makes verification instant.",
      },
      {
        question: "Why is my Performance report empty?",
        answer:
          "Data takes two to three days to appear after verification. Also confirm the property URL exactly matches your live site, including https versus http and www versus non-www; a mismatch means no data shows.",
      },
    ],
  },
  {
    slug: "track-conversions-google-analytics",
    title: "How to Track Conversions in Google Analytics 4",
    excerpt:
      "Counting visitors is not enough. You need to know who books, calls, or buys. Here is how to set up conversion tracking with GA4 key events.",
    category: "Analytics",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    seoTitle: "How to Track Conversions in GA4 (Key Events Guide)",
    seoDescription:
      "Set up GA4 events for form submissions, phone clicks, and purchases, mark them as key events, and verify them in DebugView so you can measure real outcomes.",
    bodyHtml: `<p>Traffic numbers feel good but tell you little. The question that matters is how many of those visitors did something valuable: filled in the contact form, tapped the phone number, booked, or bought. That is conversion tracking, and without it you cannot tell which pages and channels actually produce customers. In GA4, conversions are set up as events you then mark as key events.</p>
<h2>Why it changes how you work</h2>
<p>Once you track conversions, you can see that one traffic source converts at triple the rate of another, or that a particular page quietly drives most of your leads. You stop optimising for visits and start optimising for outcomes.</p>
<h2>Step by step</h2>
<ol>
<li><strong>List your key actions.</strong> Pick the three to five that matter most: contact-form submissions, phone-number clicks, bookings, purchases, newsletter signups.</li>
<li><strong>Set up an event for each.</strong> Some are captured automatically by Enhanced Measurement, such as outbound clicks. Others, like a form submission, you set up with Google Tag Manager or by firing an event on the thank-you page.</li>
<li><strong>Mark them as key events.</strong> In GA4's admin, flag each event as a key event so GA4 treats it as a conversion and can pass it to Google Ads.</li>
<li><strong>Test in DebugView.</strong> Use GA4's DebugView to perform the action yourself and confirm the event fires correctly before you rely on the data.</li>
<li><strong>Build simple reporting.</strong> Create a view or audience around your converters so you can compare channels and pages by outcome.</li>
<li><strong>Watch for drops.</strong> Set up alerts so a sudden fall in conversions reaches you quickly.</li>
</ol>
<h2>A terminology note</h2>
<p>GA4 renamed "conversions" to "key events" in 2024. An event records that something happened; marking it a key event tells GA4 it is one of your important outcomes. The event name must match exactly, and data can take up to 24 hours to settle.</p>`,
    faq: [
      {
        question: "What is the difference between an event and a key event in GA4?",
        answer:
          "An event records any tracked interaction, like a click or a form submission. A key event is an event you have flagged as important, GA4's term for a conversion since the 2024 rename. You create the event first, then mark it as a key event.",
      },
      {
        question: "My event fires but shows zero key events. Why?",
        answer:
          "You likely created the event but did not mark it as a key event. Go to the Key Events area in GA4 admin and toggle it on. Confirm the event name matches exactly, since it is case-sensitive, and allow up to 24 hours for data.",
      },
      {
        question: "How do I track a contact-form submission?",
        answer:
          "The most reliable methods are to fire an event when the form submits (via Google Tag Manager) or to trigger one on the thank-you page the form redirects to. Test it in DebugView to confirm it fires before trusting the numbers.",
      },
    ],
  },
];
