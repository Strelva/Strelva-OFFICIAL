import type { GuideArticle } from "@/lib/guides";

// Repurposed OWSH Systems fix guides (batch 2). Authored as SEO articles.
// Topics: Local SEO, Performance, Conversion, AI Visibility, Trust & Credibility.
// Source: owsh-systems fixGuides categories locally-visible, fast-performant,
// conversion-ready, ai-readable, trustworthy. Verified + updated for 2026.
export const batch2: GuideArticle[] = [
  // ----------------------------------------------------------------------
  // LOCAL SEO
  // ----------------------------------------------------------------------
  {
    slug: "local-claim-google-business-profile",
    title: "How to Claim Your Google Business Profile (Step by Step)",
    excerpt:
      "An unclaimed listing means anyone can edit your business info and you miss out on reviews, posts, and Maps visibility. Here is how to claim and verify it.",
    category: "Local SEO",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>If your business shows up on Google Maps but you have never logged in to manage it, your <strong>Google Business Profile is unclaimed</strong>. That means you cannot control your hours, photos, or description, anyone can suggest edits, and you cannot reply to reviews or use posts. For a local business, this is the single highest-leverage free thing you can fix.</p>
<h2>Why claiming matters</h2>
<p>The Google Business Profile is what feeds the map pack, the panel on the right of search, and increasingly the answers people get from AI assistants. An unclaimed profile is a profile you do not control, and competitors or random users can change details on it. Claiming it unlocks reviews management, posts, messaging, and the insights that show how customers find you.</p>
<h2>How to claim it</h2>
<ol>
<li><strong>Find your listing.</strong> Search your exact business name plus city on Google. If a panel appears with a "Claim this business" or "Own this business?" link, click it. If nothing appears, go to <a href="https://business.google.com">business.google.com</a> and add your business.</li>
<li><strong>Start the claim.</strong> Sign in with the Google account you want to own the profile long term (use a business account, not a personal one you might lose access to). Confirm the name, category, and address.</li>
<li><strong>Verify ownership.</strong> Google offers verification by phone, text, email, video, or postcard depending on your business type. Video verification has become the most common method in 2026 for service businesses, so have your storefront, signage, or work vehicle ready to film.</li>
<li><strong>Enter the code and confirm.</strong> Once verified, your dashboard unlocks. Check that name, address, phone, and website are correct before doing anything else.</li>
</ol>
<h2>After you are verified</h2>
<p>Set your hours, write a description, pick the most specific primary category, and add photos. A claimed but empty profile still underperforms, so treat verification as step one, not the finish line.</p>
<p>If your profile was claimed years ago by a former employee or an agency you no longer work with, you can request access and Google will notify the current owner. Claiming control is worth the wait.</p>`,
    faq: [
      {
        question: "How long does Google Business Profile verification take?",
        answer:
          "Phone, text, and email verification are usually instant. Video verification is typically reviewed within a few days. Postcard verification takes 5 to 14 days to arrive. Until you are verified you cannot make most edits public.",
      },
      {
        question: "What if someone else already claimed my business?",
        answer:
          "Use the 'Request access' option. Google emails the current owner, who has a few days to respond. If they do not, you can claim it. Do not create a duplicate listing, which can get both suspended.",
      },
    ],
  },
  {
    slug: "local-complete-google-business-profile",
    title: "How to Complete Your Google Business Profile for More Local Visibility",
    excerpt:
      "A fully filled-out profile ranks better and earns more clicks. Here is exactly which fields to complete and how to write them.",
    category: "Local SEO",
    difficulty: "easy",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Claiming your Google Business Profile is step one. Completing it is what actually moves you up in the map pack. Profiles with thorough information are far more likely to be seen as reputable and to earn calls, direction requests, and website clicks. An incomplete profile quietly costs you customers every day.</p>
<h2>Why completeness wins</h2>
<p>Google rewards profiles that answer a searcher's question without a second click. Every field you fill in (description, categories, hours, services, attributes) is another signal that helps Google match you to the right searches and helps a customer choose you over the next listing.</p>
<h2>The fields that matter most</h2>
<ol>
<li><strong>Primary category.</strong> Pick the single most specific category for your core service, for example "Emergency Plumber" rather than "Plumber." Add a handful of accurate secondary categories for your other services.</li>
<li><strong>Business description.</strong> Write 700 or more characters that name what you do, the areas you serve, and a clear reason to choose you. Work in the way real customers describe your service. Avoid keyword stuffing.</li>
<li><strong>Hours and contact info.</strong> Set accurate hours for all seven days and add special hours for holidays. Make sure the phone number and website exactly match your site.</li>
<li><strong>Services and products.</strong> List your services with short descriptions and pricing where it makes sense. This populates the "Services" tab customers browse before calling.</li>
<li><strong>Attributes.</strong> Set every applicable attribute (wheelchair accessible, free Wi-Fi, women-owned, online estimates, and so on). These power filtered searches and AI answers.</li>
</ol>
<h2>Check your work</h2>
<p>View your profile the way a customer sees it on both mobile and desktop. There should be no "incomplete" prompts in the dashboard and no blank sections. Then revisit it monthly, because hours, services, and offers change and stale info erodes trust.</p>
<p>Strelva's free site audit flags when your on-site business information does not match your profile, which is one of the most common reasons local rankings stall.</p>`,
    faq: [
      {
        question: "How many categories should I add to my Google Business Profile?",
        answer:
          "One precise primary category plus three to five accurate secondary categories. Only add categories that genuinely describe services you offer. Irrelevant categories can confuse Google and hurt rankings.",
      },
      {
        question: "Does the business description affect local rankings?",
        answer:
          "The description is not a direct ranking factor, but it influences whether a customer chooses you and feeds AI assistants that summarize your business. Write it for humans, include your location and core services naturally, and keep it current.",
      },
    ],
  },
  {
    slug: "local-resolve-google-business-profile-suspension",
    title: "How to Recover a Suspended Google Business Profile",
    excerpt:
      "A suspended profile disappears from Search and Maps. Here is how to find the cause, fix the violation, and file a reinstatement appeal.",
    category: "Local SEO",
    difficulty: "hard",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>A suspended Google Business Profile vanishes from Search and Maps, and every day it stays down you lose calls and customers. Suspensions are stressful but recoverable if you work methodically. Panic edits and repeated appeals make things worse, so slow down and follow a process.</p>
<h2>First, identify the suspension type</h2>
<p>There are two kinds. A <strong>soft suspension</strong> means you lose management access but the listing still shows publicly. A <strong>hard suspension</strong> means the listing is removed entirely. Check the GBP dashboard for the notice and note the exact wording, since it hints at the violation.</p>
<h2>Common causes</h2>
<ul>
<li>Address issues: using a virtual office, a PO box, or a home address you are not allowed to display.</li>
<li>Keyword stuffing in the business name (adding "Best Cheap Plumber" when your real name is "Smith Plumbing").</li>
<li>Recent risky edits, like changing your name, address, or category all at once.</li>
<li>Category that does not match what your website shows you do.</li>
</ul>
<h2>Fix before you appeal</h2>
<ol>
<li><strong>Correct every violation first.</strong> Set your business name to exactly what appears on your signage and legal documents. Fix the address to match your real, eligible location. Align categories with your website.</li>
<li><strong>Gather documentation.</strong> Collect proof of address (a utility bill or lease), business license, and photos of signage. Reinstatement requests almost always ask for these.</li>
<li><strong>Submit one reinstatement request.</strong> Use the official appeal form, explain the corrections you made plainly, and attach your documents. Do not submit multiple appeals, which slows everything down.</li>
<li><strong>Wait and monitor.</strong> Google typically responds in 3 to 14 days. If reinstated, leave the profile alone for a few weeks before making further edits.</li>
</ol>
<h2>If you are denied</h2>
<p>Re-read the denial, look for a violation you missed, fix it, and appeal again with clearer documentation. Persistent, accurate appeals are reinstated more often than people expect.</p>`,
    faq: [
      {
        question: "How long does Google Business Profile reinstatement take?",
        answer:
          "Most appeals get a response within 3 to 14 days. Complex cases take longer. Submit a single, well-documented appeal and avoid resubmitting, which resets the queue.",
      },
      {
        question: "Will I lose my reviews if my profile is suspended?",
        answer:
          "Reviews are tied to the listing and typically return when the profile is reinstated. This is one more reason to appeal rather than create a new listing, which would start your reviews from zero.",
      },
    ],
  },
  {
    slug: "local-add-google-business-profile-photos",
    title: "How to Add Photos to Your Google Business Profile (and Why It Drives Calls)",
    excerpt:
      "Businesses with lots of quality photos get dramatically more calls and direction requests. Here is what to upload and how to keep it fresh.",
    category: "Local SEO",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Photos are one of the highest-impact, lowest-effort improvements you can make to a Google Business Profile. Listings with a deep, current photo library get far more calls and direction requests than sparse ones, because photos answer the customer's first question: is this a real, trustworthy place I want to visit or hire?</p>
<h2>Why photos move the needle</h2>
<p>Strong visuals build confidence before anyone reads a word. They also give Google more to work with, and they keep your profile looking active, which is itself a positive signal. A profile with one blurry logo loses to a competitor with 30 clear, recent shots every time.</p>
<h2>What to upload</h2>
<ol>
<li><strong>Logo and cover photo.</strong> Add a clean, square logo and a strong hero cover image that represents your business well.</li>
<li><strong>Exterior shots.</strong> Show your building, signage, and the approach from the street so customers recognize you when they arrive. Service businesses can show branded vehicles.</li>
<li><strong>Interior shots.</strong> Clean, well-lit photos of the spaces customers actually see.</li>
<li><strong>Work and product examples.</strong> Before-and-after work, finished projects, menu items, or products. This is the content that converts browsers into callers.</li>
<li><strong>Team photos.</strong> A few shots of the owner and staff humanize the business and build trust.</li>
</ol>
<h2>Quality and upkeep</h2>
<p>Shoot in good natural light, upload at 1080 pixels or larger on the long side, and avoid heavy filters or text overlays. Then keep going: adding two or three fresh photos a month signals an active business and gives returning searchers something new. Remove any low-quality or outdated images that no longer represent you.</p>
<p>One caution: customers can also add photos. Check the "By customer" tab periodically and flag anything inaccurate or inappropriate so your owner photos stay front and center.</p>`,
    faq: [
      {
        question: "How many photos should a Google Business Profile have?",
        answer:
          "Aim for at least 25 owner-uploaded photos across logo, exterior, interior, work examples, and team, then add a few new ones each month. More high-quality photos consistently correlate with more customer actions.",
      },
      {
        question: "What size should Google Business Profile photos be?",
        answer:
          "Upload at least 720 by 720 pixels, ideally 1080 pixels or more on the longest side, so they still look sharp after Google compresses them. Use well-lit, accurate images without heavy filters.",
      },
    ],
  },
  {
    slug: "local-create-google-business-profile-posts",
    title: "How to Use Google Business Profile Posts to Stay Visible Locally",
    excerpt:
      "Posts keep your profile active, surface offers and events in local results, and signal to Google that your business is engaged. Here is how to run them.",
    category: "Local SEO",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    bodyHtml: `<p>Google Business Profile posts are short updates that appear directly on your listing in Search and Maps. They are free, they keep your profile looking active, and they give customers a reason to act. Most local businesses ignore them, which makes them an easy edge.</p>
<h2>Why posting helps</h2>
<p>Regular posts signal to Google that your business is active and engaged, which supports local ranking. Just as important, an offer or event post can be the nudge that turns a browser into a customer while they are already looking at your listing.</p>
<h2>The post types to use</h2>
<ol>
<li><strong>Update posts.</strong> News, tips, seasonal reminders, or a recent project. Keep them short, add a quality photo, and include a call-to-action button.</li>
<li><strong>Offer posts.</strong> A specific deal with a start and end date. These stand out visually and create urgency.</li>
<li><strong>Event posts.</strong> Anything with a date, from a sale to a community event.</li>
</ol>
<h2>How to write a good post</h2>
<p>Lead with the benefit in the first sentence, since text gets truncated. Use a clear photo, work your city or neighborhood name in naturally, and always attach a CTA button (Call, Book, Learn more) pointed at a tracked link so you can measure what works.</p>
<h2>Make it sustainable</h2>
<p>Consistency beats volume. Build a simple four-week content calendar and aim to post once or twice a week. Reuse seasonal themes year over year, and check your profile insights to see which posts drove clicks. Posts expire from prominence over time, so a steady cadence keeps your listing looking alive.</p>
<p>If posting weekly is unrealistic for you, this is exactly the kind of recurring task a managed-site service handles in the background while you run the business.</p>`,
    faq: [
      {
        question: "How often should I post on Google Business Profile?",
        answer:
          "Once or twice a week is a strong, sustainable cadence. Consistency matters more than volume. Posts lose prominence after a week or so, so a steady rhythm keeps your listing looking active.",
      },
      {
        question: "Do Google Business Profile posts improve rankings?",
        answer:
          "Posting is not a heavy direct ranking factor, but it signals an active profile and drives clicks and calls. The combination of engagement signals and conversions is why consistent posting is worth the few minutes it takes.",
      },
    ],
  },
  {
    slug: "local-build-citations-directory-listings",
    title: "How to Build Local Citations and Directory Listings",
    excerpt:
      "Consistent mentions of your name, address, and phone across the web are a top local ranking factor. Here is how to build and maintain them.",
    category: "Local SEO",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>A citation is any online mention of your business name, address, and phone number (your NAP), whether in a directory, a social profile, or an industry site. Consistent, widespread citations tell Google your business is real, established, and relevant to your area. They remain one of the most reliable local ranking factors.</p>
<h2>Why citations still matter</h2>
<p>Search engines and AI assistants cross-reference your details across many sources before they confidently surface or recommend you. The more places your exact NAP appears and agrees, the more trust they assign. Inconsistent or missing citations create doubt and hold rankings back.</p>
<h2>How to build them</h2>
<ol>
<li><strong>Lock your canonical NAP.</strong> Write down your exact business name, address, and phone in one format that matches your Google Business Profile precisely. This is your single source of truth for every listing.</li>
<li><strong>Submit to the major data aggregators.</strong> Foursquare and Data Axle still feed many smaller directories. Getting your data into them propagates correct info widely.</li>
<li><strong>Claim the top-tier directories.</strong> Yelp, Facebook, Apple Maps (via Apple Business Connect), Bing Places, the Better Business Bureau, and YellowPages. Complete each profile fully, not just the NAP.</li>
<li><strong>Add industry and local citations.</strong> Trade-specific directories, your local Chamber of Commerce, and city or regional directories carry extra weight because they are topically and geographically relevant.</li>
<li><strong>Fix and dedupe.</strong> Search for old or incorrect listings and correct them, and request removal of any duplicates, which actively hurt you.</li>
</ol>
<h2>Maintain it</h2>
<p>Keep a simple spreadsheet of every active listing with its login. Set a quarterly reminder to re-check the big platforms, because directories drift and a phone-number change can fall out of sync fast. Citation building is not a one-time project; it is light, ongoing hygiene.</p>`,
    faq: [
      {
        question: "How many citations does a local business need?",
        answer:
          "Quality and consistency beat raw quantity. Start with the major platforms and a handful of strong industry and local directories. A dozen accurate, complete citations outperform fifty sloppy ones.",
      },
      {
        question: "Do duplicate listings hurt local SEO?",
        answer:
          "Yes. Duplicate listings split your signals and confuse search engines about which one is authoritative. Find duplicates on each platform and request removal or merge them into a single correct listing.",
      },
    ],
  },
  {
    slug: "local-fix-nap-inconsistencies",
    title: "How to Fix NAP Inconsistencies Across the Web",
    excerpt:
      "When your name, address, or phone differs across listings, Google loses confidence and ranks you lower. Here is how to audit and fix it everywhere.",
    category: "Local SEO",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>NAP stands for Name, Address, and Phone number. When those details differ across the web, even slightly, Google loses confidence in your business data and can rank you lower in local results. "St" versus "Street," an old phone number, or a former suite number all count. Cleaning this up is one of the most reliable local SEO fixes.</p>
<h2>Why small differences matter</h2>
<p>Search engines treat your business as an entity and corroborate it across sources. Conflicting details look like two different businesses or like stale data, and that uncertainty suppresses rankings. Consistency is the signal you are after.</p>
<h2>How to fix it</h2>
<ol>
<li><strong>Document your canonical NAP.</strong> Decide the one exact format you will use everywhere, matching your Google Business Profile character for character, and write it down.</li>
<li><strong>Audit your current listings.</strong> Search your business name and phone number on Google and check the major directories. Note every place the NAP is wrong or formatted differently.</li>
<li><strong>Fix the big platforms first.</strong> Update Google, Yelp, Facebook, Bing Places, and Apple Maps to the canonical NAP.</li>
<li><strong>Fix aggregators and industry directories.</strong> Correct Foursquare and Data Axle, then any trade-specific directories you appear in.</li>
<li><strong>Fix your own website.</strong> Your footer should show the canonical NAP on every page, with a clickable tel link on the phone number, and your contact and about pages should match exactly.</li>
</ol>
<h2>Keep it consistent</h2>
<p>Set a Google Alert for your business name and schedule a quarterly NAP check. The most common cause of new inconsistencies is a change you make in one place and forget to propagate, so when your number or address changes, update every listing in the same sitting.</p>
<p>Strelva's free audit checks whether the NAP on your website is internally consistent, which is the part most owners overlook while fixing directories.</p>`,
    faq: [
      {
        question: "Does NAP formatting really need to be identical everywhere?",
        answer:
          "Aim for as close to identical as possible. Search engines tolerate minor variation, but consistent formatting removes all doubt and is the safest path. Pick one format and use it everywhere.",
      },
      {
        question: "What is the most overlooked place to fix NAP?",
        answer:
          "Your own website. Owners spend hours on directories but leave an old phone number in the footer or an outdated address on the contact page. Make your site match your canonical NAP first.",
      },
    ],
  },
  {
    slug: "local-create-location-pages",
    title: "How to Create Location Pages That Rank in Local Search",
    excerpt:
      "Service-area and multi-location businesses need a dedicated page per area. Here is how to build pages that rank instead of looking like thin duplicates.",
    category: "Local SEO",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    bodyHtml: `<p>If you serve several towns or run multiple locations, a single "Areas we serve" page will not rank you in each of them. You need a dedicated page per area, built with genuinely unique content. Done well, location pages help you appear for "[service] in [city]" searches across your whole territory. Done lazily, they become thin duplicates that Google ignores or penalizes.</p>
<h2>Why dedicated pages work</h2>
<p>Each location page gives Google a clear, focused target for a specific city and service combination. It also gives customers in that area the local proof they want: that you actually work there, know the area, and have done jobs nearby.</p>
<h2>How to build them right</h2>
<ol>
<li><strong>List your real service areas.</strong> Start with the towns and neighborhoods you genuinely serve and can speak about with specificity. Do not create pages for places you have never worked.</li>
<li><strong>Plan unique content per page.</strong> This is the step that decides success. Each page needs 500 or more words of original content: local landmarks, neighborhoods served, area-specific projects or testimonials, and answers to questions that town's customers actually ask.</li>
<li><strong>Optimize for local keywords.</strong> Put the city name in the URL, title tag, meta description, and H1. Then use it naturally in the body, never stuffed.</li>
<li><strong>Add LocalBusiness schema.</strong> Include schema with the correct area served on each page so search engines and AI understand the geography.</li>
<li><strong>Interlink and submit.</strong> Link the pages to each other and to relevant service pages in a hub-and-spoke pattern, add them to your navigation or a service-area hub, and include them in your sitemap so they get indexed.</li>
</ol>
<h2>The mistake to avoid</h2>
<p>Do not spin up twenty near-identical pages with only the city name swapped. Google's systems detect this and it can drag down your whole site. Fewer, genuinely useful pages beat a pile of templated ones every time.</p>`,
    faq: [
      {
        question: "How many location pages should I create?",
        answer:
          "Only as many as you can fill with genuinely unique, useful content. Start with your top three to five priority areas and expand as you can write real, area-specific pages. Quality protects your whole site.",
      },
      {
        question: "Will location pages get penalized as duplicate content?",
        answer:
          "Only if they are thin or templated with just the city name swapped. Pages with original local content, real projects, and area-specific detail are safe and effective. Uniqueness is the dividing line.",
      },
    ],
  },
  {
    slug: "local-define-service-areas",
    title: "How to Define Service Areas for a Mobile or Service-Area Business",
    excerpt:
      "If you travel to customers, you need to tell Google exactly where you work. Here is how to set service areas so you rank across your whole territory.",
    category: "Local SEO",
    difficulty: "easy",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    bodyHtml: `<p>If you go to your customers (plumber, cleaner, landscaper, mobile mechanic, electrician), you are a service-area business, and you need to tell Google exactly where you work. Without defined service areas, you will mostly rank near your business address and miss customers across the rest of your territory.</p>
<h2>Why this matters for mobile businesses</h2>
<p>Google ranks service-area businesses largely by where they say they operate. A plumber who only lists their home base will be invisible to searchers two towns over, even though they happily drive there. Defining your areas expands the map of searches you can win.</p>
<h2>How to set it up</h2>
<ol>
<li><strong>Map your real territory.</strong> List every city and neighborhood you serve, then tier them: Tier 1 is your core, highest-priority areas, Tier 2 is the wider radius you still cover.</li>
<li><strong>Configure service areas in your profile.</strong> In Google Business Profile, set up to 20 service areas. Use your Tier 1 and Tier 2 cities. If you are purely mobile, hide your address and show service areas only.</li>
<li><strong>Build website pages for your areas.</strong> Create a service-area hub page that links to individual location pages with unique, area-specific content. Search engines need on-site proof, not just a profile setting.</li>
<li><strong>Add service-area schema.</strong> Use LocalBusiness schema with the area served property on your homepage and location pages.</li>
<li><strong>Stay consistent everywhere.</strong> Mention your service areas the same way in your website footer, about page, contact page, profile description, and directory listings.</li>
</ol>
<h2>Keep it honest</h2>
<p>List only areas you genuinely serve. Stuffing in distant cities you cannot reach looks spammy to Google and disappoints customers who call. A tight, accurate territory backed by real content outperforms an inflated one.</p>`,
    faq: [
      {
        question: "Should a service-area business show its address on Google?",
        answer:
          "If you operate from home or have no public storefront, hide the address and display service areas only. Google supports this for service-area businesses, and it avoids the address-related issues that can trigger suspensions.",
      },
      {
        question: "How many service areas can I add in Google Business Profile?",
        answer:
          "Up to 20. Use them on your highest-priority cities and neighborhoods, and back them with real location pages on your website so the claim is supported by content search engines can crawl.",
      },
    ],
  },
  {
    slug: "local-improve-search-visibility-playbook",
    title: "How to Improve Your Local Search Visibility: The Complete Playbook",
    excerpt:
      "Not showing up when locals search for your service? This is the end-to-end local SEO playbook that gets you into the map pack and local results.",
    category: "Local SEO",
    difficulty: "medium",
    readingTime: "8 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    bodyHtml: `<p>If your business does not appear when nearby customers search for what you do, you are leaving money on the table every day. Local visibility is not one trick; it is a handful of fundamentals working together. This playbook ties them into a clear order so you know what to do first.</p>
<h2>Why local visibility compounds</h2>
<p>Local ranking comes from relevance, distance, and prominence. You cannot change where a searcher is standing, but you can strongly influence relevance and prominence through your profile, your citations, your reviews, and your website. Each one reinforces the others, which is why a coordinated push beats scattered effort.</p>
<h2>The playbook in order</h2>
<ol>
<li><strong>Audit your current position.</strong> Search your main service plus city and see where you land in the map pack and organic results. This is your baseline.</li>
<li><strong>Optimize your Google Business Profile.</strong> Claim it, complete every field, pick the most specific category, and add 25 or more photos. This is the highest-leverage step.</li>
<li><strong>Build citations and fix NAP.</strong> Get consistent name, address, and phone across the major directories and your own site.</li>
<li><strong>Earn a steady flow of reviews.</strong> Ask every satisfied customer, respond to all reviews, and aim for a few new ones each month.</li>
<li><strong>Optimize your website for local signals.</strong> Local title tags, footer NAP, a contact page with an embedded map, and LocalBusiness schema.</li>
<li><strong>Publish local content.</strong> A few location pages and local blog posts that prove you serve and know your area.</li>
</ol>
<h2>Then measure and keep going</h2>
<p>Watch your profile insights for month-over-month increases in views and customer actions, and track your ranking for your core "service plus city" search. Local SEO is cumulative; the businesses that win are the ones that keep the fundamentals current rather than doing them once.</p>
<p>If you want this run for you, a managed-site service handles the profile, citations, reviews, and content as ongoing work instead of a project you have to remember.</p>`,
    faq: [
      {
        question: "How long does local SEO take to show results?",
        answer:
          "Profile optimizations can move things within a few weeks. Citations, reviews, and content compound over two to six months. Local SEO rewards consistency, so the gains build the longer you maintain the fundamentals.",
      },
      {
        question: "What is the single most important local ranking factor?",
        answer:
          "A complete, active, well-reviewed Google Business Profile does the most heavy lifting, followed closely by consistent citations and a steady review flow. Start there before investing in anything more advanced.",
      },
    ],
  },

  // ----------------------------------------------------------------------
  // PERFORMANCE
  // ----------------------------------------------------------------------
  {
    slug: "performance-improve-lcp",
    title: "How to Fix a Slow Largest Contentful Paint (LCP)",
    excerpt:
      "LCP measures how fast your main content loads. Under 2.5 seconds is the target. Here is how to find what is slow and fix it.",
    category: "Performance",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "web-vitals",
    bodyHtml: `<p>Largest Contentful Paint, or LCP, measures how long it takes for the main content of your page to appear. Google considers under 2.5 seconds "good," and it directly affects rankings and how fast your site feels. On most sites the LCP element is the hero image, the headline, or the main content block.</p>
<h2>Why LCP matters</h2>
<p>A slow LCP means visitors stare at a blank or half-loaded screen, and many leave before the page finishes. It is also one of the Core Web Vitals Google uses as a ranking signal, so a poor score costs you both conversions and search position.</p>
<h2>How to fix it</h2>
<ol>
<li><strong>Measure first.</strong> Run your page through PageSpeed Insights and note your LCP and which element it points to. Fix that element, not random things.</li>
<li><strong>Optimize the LCP element.</strong> If it is an image, compress it, serve a modern format (WebP or AVIF), size it correctly, and add fetchpriority="high" so the browser loads it first.</li>
<li><strong>Preload critical resources.</strong> Preload the LCP image and any fonts the headline depends on so the browser does not discover them late.</li>
<li><strong>Remove render-blocking resources.</strong> Defer non-critical CSS and JavaScript so they do not hold up the first paint.</li>
<li><strong>Improve server response time.</strong> Aim for a Time to First Byte under 600 milliseconds. Caching and a faster host help here.</li>
</ol>
<h2>Verify the win</h2>
<p>Re-run PageSpeed Insights and confirm LCP is under 2.5 seconds on mobile, since mobile is what Google measures most. Because lab scores and real-user data can differ, watch the Core Web Vitals report in Search Console over the following weeks to confirm real visitors see the improvement.</p>
<p>If your site runs on a managed platform where you cannot edit the underlying code, this is exactly the kind of fix a site-management service handles for you.</p>`,
    faq: [
      {
        question: "What is a good LCP score?",
        answer:
          "Under 2.5 seconds is good, 2.5 to 4 seconds needs improvement, and over 4 seconds is poor. Google measures mobile LCP for ranking, so optimize for mobile first.",
      },
      {
        question: "Why is my LCP good in tests but poor in Search Console?",
        answer:
          "Lab tools test one load on a fast connection. Search Console reports real users on varied devices and networks. Trust the field data and test on a throttled mobile connection to reproduce what real visitors experience.",
      },
    ],
  },
  {
    slug: "performance-optimize-images-faster-loading",
    title: "How to Optimize Images for a Faster Website",
    excerpt:
      "Large images are the number one cause of slow sites. Here is how to cut image weight by 60 to 80 percent without visible quality loss.",
    category: "Performance",
    difficulty: "easy",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "web-vitals",
    bodyHtml: `<p>Unoptimized images are the single biggest cause of slow websites. On most sites they account for the majority of total page weight. The good news is that this is also the easiest performance problem to fix: you can usually cut image weight by 60 to 80 percent with no visible quality loss.</p>
<h2>Why image weight matters</h2>
<p>Every oversized image delays your page, hurts your LCP, and burns mobile data for visitors on slower connections. Lighter images mean faster loads, better Core Web Vitals, and higher conversion rates, especially on phones.</p>
<h2>How to optimize them</h2>
<ol>
<li><strong>Find your largest images.</strong> Use PageSpeed Insights or your browser's network tab to see which images weigh the most. Fix the heaviest first.</li>
<li><strong>Choose the right format.</strong> Use WebP or AVIF for photos, SVG for logos and icons, and PNG only when you truly need transparency. Modern formats are dramatically smaller than old JPEGs and PNGs.</li>
<li><strong>Resize to the real display size.</strong> A 4000-pixel-wide photo shown in a 800-pixel slot is wasted weight. Export images at no more than twice their display size.</li>
<li><strong>Compress.</strong> Run images through a tool like Squoosh and reduce quality until just before you can see a difference. The savings are large and invisible.</li>
<li><strong>Enable lazy loading.</strong> Add loading="lazy" to below-the-fold images so they only load as the visitor scrolls. Keep above-the-fold and your LCP image eager.</li>
</ol>
<h2>Verify and maintain</h2>
<p>Re-test in PageSpeed Insights and confirm the "properly size images" and "efficiently encode images" warnings are gone and your LCP improved. Then make compression a habit: optimize every new image before you upload it, so the problem never creeps back.</p>`,
    faq: [
      {
        question: "What is the best image format for websites in 2026?",
        answer:
          "WebP for photographs, with AVIF where supported for even smaller files, SVG for logos and icons, and PNG only when you need transparency. Modern formats are far smaller than legacy JPEG and PNG at the same quality.",
      },
      {
        question: "How small should website images be?",
        answer:
          "Keep most images under 200KB, hero images under about 150KB, and total image weight on a page under 500KB. Resize to twice the display size at most and compress until just before quality loss is visible.",
      },
    ],
  },
  {
    slug: "performance-fix-cumulative-layout-shift",
    title: "How to Fix Cumulative Layout Shift (CLS) on Your Website",
    excerpt:
      "CLS measures how much your page jumps around while loading. Under 0.1 is the target. Here is how to stop the shifting.",
    category: "Performance",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "web-vitals",
    bodyHtml: `<p>Cumulative Layout Shift, or CLS, measures how much elements move around unexpectedly while your page loads. You have felt it: you go to tap a button and the page jumps, so you tap the wrong thing. Google considers a CLS under 0.1 "good," and it is one of the Core Web Vitals that affects rankings.</p>
<h2>Why CLS matters</h2>
<p>Layout shifts frustrate users, cause mis-taps, and make a site feel cheap and broken. They also hurt your search position. The usual culprits are images without dimensions, late-loading fonts, ads and embeds, and content injected after the page renders.</p>
<h2>How to fix it</h2>
<ol>
<li><strong>Find the shifts.</strong> Record a page load in your browser's Performance panel and look for layout shift markers. Scroll and interact too, since shifts accumulate during the whole session.</li>
<li><strong>Set dimensions on media.</strong> Give every image and video explicit width and height attributes, or a CSS aspect-ratio, so the browser reserves the space before the file loads.</li>
<li><strong>Reserve space for ads and widgets.</strong> Wrap ads, embeds, and third-party widgets in a container with a min-height so they do not push content when they appear.</li>
<li><strong>Fix font loading.</strong> Use font-display: swap and preload your main fonts so text does not reflow when the custom font arrives.</li>
<li><strong>Handle injected content.</strong> Banners, cookie notices, and notifications should overlay with fixed positioning rather than push the page down.</li>
</ol>
<h2>Verify</h2>
<p>Confirm CLS is under 0.1 on both mobile and desktop, and that there are no layout-shift markers when you record a full page session. A common trap: cookie consent banners that use static positioning and shove everything down. Switch them to a fixed bottom overlay and a major source of shift disappears.</p>`,
    faq: [
      {
        question: "What causes most layout shift problems?",
        answer:
          "Images and videos without set dimensions, web fonts that reflow text when they load, ads and embeds with no reserved space, and content injected after render such as banners and cookie notices. Reserve space for all of them.",
      },
      {
        question: "How do I stop my cookie banner from causing layout shift?",
        answer:
          "Use fixed positioning so it overlays content instead of pushing it down. Set position: fixed with bottom: 0 and a high z-index. Most modern consent tools offer a bottom-overlay option in their settings.",
      },
    ],
  },
  {
    slug: "performance-improve-inp-responsiveness",
    title: "How to Improve Interaction to Next Paint (INP) and Make Your Site Feel Faster",
    excerpt:
      "INP measures how quickly your site responds to taps and clicks. Under 200ms is the target. Here is how to fix a sluggish-feeling site.",
    category: "Performance",
    difficulty: "hard",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "web-vitals",
    bodyHtml: `<p>Interaction to Next Paint, or INP, measures how quickly your site responds when someone taps, clicks, or types. Under 200 milliseconds feels instant. INP became a Core Web Vital in 2024, replacing the older First Input Delay, and a poor score makes your site feel sluggish or broken even when it loads quickly.</p>
<h2>Why INP matters</h2>
<p>Load speed gets the visitor in; responsiveness keeps them. If a button takes half a second to react, users tap again, get frustrated, and leave. INP is also a ranking signal, so a slow, janky feel costs you twice. The cause is almost always JavaScript blocking the main thread.</p>
<h2>How to fix it</h2>
<ol>
<li><strong>Measure real interactions.</strong> Use PageSpeed Insights field data and the Performance panel's interactions track with CPU throttling on to find which taps are slow.</li>
<li><strong>Audit third-party scripts.</strong> Chat widgets, analytics, and trackers are common offenders. Remove what you do not need and defer the rest.</li>
<li><strong>Defer non-critical JavaScript.</strong> Load scripts that are not needed for the first interaction after the page is interactive, or on demand.</li>
<li><strong>Optimize event handlers.</strong> Give immediate visual feedback (under 50ms) before doing heavy work, and break long tasks into smaller chunks so the browser can stay responsive.</li>
<li><strong>Reduce bundle and DOM size.</strong> Smaller JavaScript and fewer DOM elements both make every interaction cheaper, which matters most on mid-range phones.</li>
</ol>
<h2>Mobile is the real test</h2>
<p>Mobile processors are several times slower than desktop, so the same code takes much longer to run. Always test on a real mid-range Android device, not just your fast laptop. Confirm INP is under 200 milliseconds in Search Console field data, and set up real-user monitoring to catch regressions over time.</p>`,
    faq: [
      {
        question: "What is a good INP score?",
        answer:
          "Under 200 milliseconds is good, 200 to 500 needs improvement, and over 500 is poor. INP is measured from real user interactions, so optimize for mid-range mobile devices, which is where most problems appear.",
      },
      {
        question: "Why is my INP fine on desktop but bad on mobile?",
        answer:
          "Mobile processors run JavaScript several times slower than desktop. The same handlers and scripts that feel instant on a laptop block the main thread on a phone. Reduce bundle size and defer third-party scripts to fix it.",
      },
    ],
  },
  {
    slug: "performance-fix-render-blocking-resources",
    title: "How to Fix Render-Blocking Resources and Speed Up First Paint",
    excerpt:
      "Render-blocking CSS and JavaScript stop your page from showing anything until they finish loading. Here is how to unblock the first paint.",
    category: "Performance",
    difficulty: "hard",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "web-vitals",
    bodyHtml: `<p>Render-blocking CSS and JavaScript in the head of your page stop the browser from showing anything until they finish downloading and parsing. The result is a blank white screen, especially on slow connections. Fixing this improves First Contentful Paint and makes the page feel dramatically faster.</p>
<h2>Why it matters</h2>
<p>Every render-blocking file is a wall between your visitor and your content. PageSpeed Insights flags these as "eliminate render-blocking resources." Removing the block lets content paint immediately while the rest loads in the background.</p>
<h2>How to fix it</h2>
<ol>
<li><strong>Identify the blockers.</strong> Run PageSpeed Insights and note which CSS and JavaScript files are flagged as render-blocking.</li>
<li><strong>Inline critical CSS.</strong> Extract the small amount of CSS needed for above-the-fold content and inline it in the head, so the page can paint right away.</li>
<li><strong>Defer the rest of the CSS.</strong> Load the remaining stylesheets asynchronously so they do not hold up the first paint.</li>
<li><strong>Defer non-critical JavaScript.</strong> Add defer or async to scripts that are not needed immediately. Most scripts do not need to run before the page is visible.</li>
<li><strong>Tame third-party scripts.</strong> Defer them, load them on interaction, or remove the ones that do not earn their cost.</li>
<li><strong>Optimize fonts.</strong> Use font-display: swap and preload your primary fonts so text shows immediately.</li>
</ol>
<h2>Verify</h2>
<p>Re-run PageSpeed Insights and confirm the render-blocking warning is gone and First Contentful Paint is under 1.8 seconds on mobile. The clearest sign of success is the visual one: content should appear immediately instead of after a blank pause.</p>
<p>This is one of the more technical fixes on the list. If your site is on a builder or a platform you cannot fully edit, a managed-site service can handle it without you touching code.</p>`,
    faq: [
      {
        question: "What does render-blocking mean?",
        answer:
          "A render-blocking resource is CSS or JavaScript the browser must download and process before it can display the page. Until it finishes, the visitor sees a blank screen. Inlining critical CSS and deferring the rest removes the block.",
      },
      {
        question: "Is it safe to defer all JavaScript?",
        answer:
          "Defer scripts that are not needed for the initial render, which is most of them. Keep anything required to display above-the-fold content loading early. Test after deferring to make sure nothing visual breaks.",
      },
    ],
  },
  {
    slug: "performance-test-fix-mobile-ux",
    title: "How to Test and Fix Mobile Usability Issues on Your Website",
    excerpt:
      "Most searches happen on mobile. Tiny tap targets, small text, and horizontal scroll quietly cost you customers. Here is how to find and fix them.",
    category: "Performance",
    difficulty: "easy",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "mobile",
    bodyHtml: `<p>Most of your visitors are on phones. If your site is awkward on mobile (tiny tap targets, text you have to pinch to read, a layout that scrolls sideways) you are losing customers before they ever contact you. Mobile usability is both a ranking factor and a conversion factor, and the fixes are usually quick.</p>
<h2>Why mobile UX matters</h2>
<p>Over 60 percent of searches happen on mobile, and Google evaluates the mobile version of your site first. A frustrating mobile experience drives up bounce rate and drives down both rankings and leads. Small friction adds up fast on a phone.</p>
<h2>How to test and fix</h2>
<ol>
<li><strong>Test on real devices.</strong> Open your site on an actual phone, not just a resized browser window. Try to complete a real task like booking or contacting you.</li>
<li><strong>Fix the viewport.</strong> Make sure every page has a correct viewport meta tag so it scales properly on phones.</li>
<li><strong>Fix tap targets.</strong> Buttons and links should be at least 48 by 48 pixels with about 8 pixels of spacing, so people do not tap the wrong thing.</li>
<li><strong>Fix text readability.</strong> Body text should be at least 16 pixels with strong contrast, so no one has to zoom.</li>
<li><strong>Fix navigation and forms.</strong> The mobile menu should open and close cleanly, and forms should use the right keyboard types with visible labels.</li>
<li><strong>Kill horizontal scroll.</strong> Nothing should overflow the screen at common widths. Sideways scroll is an instant signal of a broken layout.</li>
</ol>
<h2>Verify across the board</h2>
<p>Check your key pages on small and large phones, in portrait and landscape, and confirm there is no horizontal scrolling anywhere. While you are at it, verify your mobile Core Web Vitals (LCP, CLS, INP) are all in the good range, since speed and usability together decide whether a mobile visitor stays.</p>`,
    faq: [
      {
        question: "What is the minimum tap target size for mobile?",
        answer:
          "At least 48 by 48 CSS pixels with about 8 pixels of spacing between targets. Anything smaller leads to mis-taps and frustration, especially for buttons placed close together.",
      },
      {
        question: "How small can body text be on mobile?",
        answer:
          "Use at least 16 pixels for body text with a contrast ratio of 4.5 to 1 or better. Smaller text forces visitors to pinch and zoom, which is a strong signal of a poor mobile experience.",
      },
    ],
  },
  {
    slug: "performance-fix-intrusive-interstitials",
    title: "How to Fix Intrusive Popups That Hurt Your Mobile Rankings",
    excerpt:
      "Full-screen popups that block content can get you penalized in mobile search. Here is how to keep popups without breaking the experience or rankings.",
    category: "Performance",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "mobile",
    bodyHtml: `<p>Popups can grow your email list, but the aggressive ones do real damage. Google penalizes intrusive interstitials (full-screen popups and overlays that block content, especially on mobile) in its mobile search results. If a visitor lands on your page and immediately has to dismiss a wall, you lose both the visitor and search position.</p>
<h2>What counts as intrusive</h2>
<p>The problem cases are full-screen popups that appear right away, large banners that cover most of the content, and standalone interstitial pages a user must dismiss to read anything. A small cookie notice at the bottom is fine; a full-screen overlay on arrival is not.</p>
<h2>How to fix it</h2>
<ol>
<li><strong>Find your interstitials.</strong> Load your key pages on a phone and note every popup, overlay, or banner that blocks content, and when it fires.</li>
<li><strong>Replace intrusive popups with compliant alternatives.</strong> Swap full-screen overlays for inline forms, slide-ins, or a small bar that does not cover the content.</li>
<li><strong>Fix timing and triggers.</strong> Do not show a popup in the first 30 seconds or on page load. Trigger it on exit intent, on scroll depth, or after meaningful engagement instead.</li>
<li><strong>Make any remaining popup small and closeable.</strong> Keep it under about 20 percent of the mobile screen, with a clearly visible close button that is at least 44 pixels, and cap frequency to once per session.</li>
</ol>
<h2>Verify the mobile experience</h2>
<p>Reload your top pages on mobile and confirm the main content is immediately accessible, nothing blocks it within the first 30 seconds, and the cookie banner is a small bottom bar rather than a full-screen overlay. A clean first impression on mobile protects both your rankings and your conversions.</p>`,
    faq: [
      {
        question: "Are all popups bad for SEO?",
        answer:
          "No. Google targets intrusive interstitials that block content on mobile, not all popups. Small banners, inline forms, exit-intent popups, and compliant cookie notices are fine. The issue is overlays that cover content right away.",
      },
      {
        question: "When can I show a popup without a penalty?",
        answer:
          "Avoid the first 30 seconds and the initial page load. Trigger on exit intent, scroll depth, or after real engagement, keep it small, and make it easy to close. Cookie consent shown as a small bottom bar is acceptable.",
      },
    ],
  },

  // ----------------------------------------------------------------------
  // CONVERSION
  // ----------------------------------------------------------------------
  {
    slug: "conversion-add-clear-calls-to-action",
    title: "How to Add Calls-to-Action That Turn Visitors Into Customers",
    excerpt:
      "Without clear CTAs, visitors who want to act cannot find a way to. Here is how to add CTAs that actually convert.",
    category: "Conversion",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    bodyHtml: `<p>A surprising number of business websites leave their visitors with nowhere to go. The person is interested, ready to call or book, and there is no obvious next step. A clear call-to-action (CTA) is the bridge between interest and a customer, and adding good ones is one of the fastest ways to lift conversions.</p>
<h2>Why CTAs matter</h2>
<p>People do not hunt for a way to contact you; they leave. Every page should make the next step obvious. A strong, visible CTA reduces that friction and turns passive visitors into calls, bookings, and form submissions.</p>
<h2>How to add effective CTAs</h2>
<ol>
<li><strong>Decide your primary action.</strong> What is the one thing you most want a visitor to do: call, book, request a quote? Lead with that.</li>
<li><strong>Put a CTA above the fold.</strong> Your main action should be visible without scrolling on every key page, in a high-contrast button that stands out.</li>
<li><strong>Repeat CTAs down the page.</strong> On longer pages, place a CTA at each natural decision point so the visitor never has to scroll back up.</li>
<li><strong>Make phone numbers click-to-call.</strong> On mobile, every phone number should be a tappable tel link.</li>
<li><strong>Write action and benefit copy.</strong> "Get a free quote" beats "Submit." Tell the visitor what they get when they click.</li>
<li><strong>Offer a low-friction option.</strong> A secondary CTA like "See pricing" or "Ask a question" captures people who are not ready to commit yet.</li>
</ol>
<h2>Test on mobile</h2>
<p>Confirm every CTA works on a phone: tap targets at least 44 pixels, no overlapping buttons, and click-to-call functioning. Add a little reassuring microcopy near the button (response time, no obligation, your guarantee) to push hesitant visitors over the line.</p>`,
    faq: [
      {
        question: "Where should I place calls-to-action?",
        answer:
          "Put your primary CTA above the fold on every key page, then repeat it at natural decision points down longer pages. The visitor should never have to scroll to find the next step.",
      },
      {
        question: "What makes a CTA button convert better?",
        answer:
          "High contrast so it stands out, action-and-benefit copy like 'Get a free quote,' a comfortable size for tapping, and reassuring microcopy nearby. Generic labels like 'Submit' underperform specific, benefit-led ones.",
      },
    ],
  },
  {
    slug: "conversion-add-complete-contact-information",
    title: "How to Add Contact Information That Builds Trust and Wins Calls",
    excerpt:
      "If visitors cannot easily reach you, they leave. Here is how to make your contact info visible, complete, and tappable on every page.",
    category: "Conversion",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Hard-to-find contact information quietly kills conversions. A large share of visitors will leave a site if they cannot quickly see how to reach you. Worse, missing contact details make a business look less legitimate. Fixing this is fast and pays off immediately.</p>
<h2>Why visible contact info matters</h2>
<p>When someone is ready to act, friction loses the sale. A phone number they have to dig for, a missing address, or no obvious contact page all create doubt. Clear, complete contact info signals a real business and makes it effortless to get in touch.</p>
<h2>How to do it right</h2>
<ol>
<li><strong>Audit what you have.</strong> Check whether your phone, email, address, and hours are visible and consistent across your site.</li>
<li><strong>Put your phone in the header.</strong> Show it on every page and make it click-to-call on mobile.</li>
<li><strong>Build a real contact page.</strong> Include all methods: phone, email, a working contact form, address, and hours.</li>
<li><strong>Add your address and a map.</strong> If you have a location, embed a Google Map and directions. This also reinforces your local presence.</li>
<li><strong>Put full contact info in the footer.</strong> Name, address, phone, email, and hours on every page, matching your Google Business Profile exactly.</li>
<li><strong>Enable click-to-call and click-to-email.</strong> Use tel and mailto links so mobile visitors connect with one tap.</li>
</ol>
<h2>Verify and align</h2>
<p>Test that your contact form actually delivers submissions, since a silently broken form is worse than none. Then confirm your name, address, and phone match your Google Business Profile and directory listings, because consistency here helps local rankings as well as trust.</p>`,
    faq: [
      {
        question: "Where should contact information appear on a website?",
        answer:
          "Phone number in the header on every page, full details on a dedicated contact page, and complete name, address, phone, email, and hours in the footer. Make phone and email tappable on mobile.",
      },
      {
        question: "Why does my contact form not receive submissions?",
        answer:
          "Common causes are a missing or misconfigured email integration, spam filtering, or a form that submits to nowhere. Always send a real test submission after setup and confirm it arrives before relying on the form.",
      },
    ],
  },
  {
    slug: "conversion-optimize-title-tags-meta-descriptions",
    title: "How to Write Title Tags and Meta Descriptions That Earn Clicks",
    excerpt:
      "Your title and description are your first impression in search results and drive your click-through rate. Here is how to write them well.",
    category: "Conversion",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "seo",
    bodyHtml: `<p>Your title tag and meta description are what people see in Google before they ever reach your site. They are your first impression and the biggest lever on your click-through rate. Two pages can rank in the same spot and one gets twice the clicks purely because its snippet is better written.</p>
<h2>Why they matter</h2>
<p>The title tag influences both rankings and clicks; the meta description influences clicks. A page with weak or duplicate titles leaves clicks on the table and confuses search engines about what each page is for. Getting these right is some of the highest-return SEO work available.</p>
<h2>How to optimize them</h2>
<ol>
<li><strong>Audit what you have.</strong> Find pages with missing, duplicate, or auto-generated titles and descriptions. Those are your priorities.</li>
<li><strong>Write unique title tags.</strong> Keep each under about 60 characters, lead with the main keyword, and include your brand or location where it helps. Every page gets its own.</li>
<li><strong>Write compelling meta descriptions.</strong> Aim for 120 to 155 characters, describe the value of the page, and include a soft call-to-action. Make someone want to click.</li>
<li><strong>Fix your H1s.</strong> Each page should have exactly one H1 that matches the page's purpose and includes the main keyword naturally.</li>
<li><strong>Add Open Graph tags.</strong> So your page looks good when shared on social platforms.</li>
</ol>
<h2>Measure and iterate</h2>
<p>After updating, watch Search Console over a few weeks. If a page gets impressions but few clicks, rewrite its title and description to be more compelling and check again. Note that Google sometimes rewrites descriptions, but a clear, relevant one still wins more often than not.</p>`,
    faq: [
      {
        question: "How long should a title tag and meta description be?",
        answer:
          "Keep title tags under about 60 characters and meta descriptions between 120 and 155 characters so they do not get cut off in search results. Every page should have a unique title and description.",
      },
      {
        question: "Does the meta description affect rankings?",
        answer:
          "Not directly, but it strongly affects click-through rate, which influences how much traffic a ranking earns. A compelling description gets more clicks even at the same position, so it is well worth writing carefully.",
      },
    ],
  },
  {
    slug: "conversion-create-service-pages",
    title: "How to Create Service Pages That Rank for Each Service You Offer",
    excerpt:
      "A single page listing all your services cannot rank for each one. Here is how dedicated service pages capture more search traffic and convert.",
    category: "Conversion",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    bodyHtml: `<p>If all your services are crammed onto one page, you are competing for each service keyword with a page that is only partly about it. Dedicated service pages let each offering target its own keywords, go deep on detail, and rank independently. For most local businesses this is one of the biggest untapped traffic sources.</p>
<h2>Why dedicated pages win</h2>
<p>Search engines reward focused, relevant pages. A page entirely about "drain cleaning" will outrank a generic services page for that search, and it will convert better too, because the visitor gets exactly the information they came for instead of a list.</p>
<h2>How to build them</h2>
<ol>
<li><strong>List every service.</strong> Write out each distinct service or product you offer. Each one is a potential page.</li>
<li><strong>Plan the structure.</strong> Group related services logically and decide on a clean URL pattern like /services/[service-name].</li>
<li><strong>Write unique, optimized content.</strong> Each page needs 500 or more words covering what the service is, who it is for, your process, pricing where appropriate, and the target keyword in the title, description, and H1.</li>
<li><strong>Add an FAQ to each page.</strong> Answer the real questions customers ask about that service. This helps both conversions and AI visibility.</li>
<li><strong>Interlink and add to navigation.</strong> Link service pages to each other and to relevant content, and make them reachable from your main menu.</li>
<li><strong>Submit for indexing.</strong> Add the pages to your sitemap and confirm they appear in Search Console.</li>
</ol>
<h2>Keep them genuine</h2>
<p>As with location pages, avoid thin or near-duplicate pages. Each service page should earn its place with real, specific content. A handful of strong service pages beats a dozen shallow ones and protects the SEO health of your whole site.</p>`,
    faq: [
      {
        question: "How long should a service page be?",
        answer:
          "At least 500 words of unique, useful content covering what the service is, who it is for, your process, and common questions. Depth helps you rank and gives the visitor enough to choose you.",
      },
      {
        question: "Should every service have its own page?",
        answer:
          "Every distinct service worth ranking for should, as long as you can write genuinely unique content for it. Group very similar offerings together rather than spinning up thin, near-duplicate pages.",
      },
    ],
  },
  {
    slug: "conversion-create-blog-content-hub",
    title: "How to Start a Blog That Brings in Search Traffic",
    excerpt:
      "A blog targets the questions customers search before they buy, builds authority, and feeds your other pages. Here is how to set one up right.",
    category: "Conversion",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "content",
    bodyHtml: `<p>A blog is not about diary entries; it is about capturing the questions your customers search for before they are ready to buy. A well-run content hub drives organic traffic, builds authority in your field, supports your service pages with internal links, and gives you material for social and email. Most competitors do this badly or not at all, which is the opportunity.</p>
<h2>Why a blog earns traffic</h2>
<p>Service pages capture people ready to buy. Blog posts capture the much larger group still researching ("how much does X cost," "do I need X or Y," "best way to fix Z"). Answer those questions well and you build trust early and stay in front of the customer until they are ready.</p>
<h2>How to set it up</h2>
<ol>
<li><strong>Plan a content strategy.</strong> List the real questions customers ask and the informational searches around your services. Prioritize the ones with clear buying intent behind them.</li>
<li><strong>Set up the blog.</strong> Use clean URLs at /blog or /resources on your existing platform. Keep the design consistent with your site.</li>
<li><strong>Write three to five foundational posts.</strong> Aim for 1000 or more words each, genuinely answering the question rather than padding. These anchor your hub.</li>
<li><strong>Optimize each post.</strong> Strong title tag, meta description, clear heading structure, and internal links to your relevant service pages.</li>
<li><strong>Add the blog to navigation.</strong> Make it reachable from your menu, footer, and homepage.</li>
<li><strong>Make it crawlable.</strong> Add posts to your sitemap and submit for indexing in Search Console.</li>
</ol>
<h2>Consistency is the whole game</h2>
<p>A blog with three posts that stops is worse than none. The traffic compounds only if you keep publishing useful content on a steady cadence. This is exactly the kind of ongoing work a managed-content service can run for you so it does not stall the moment you get busy.</p>`,
    faq: [
      {
        question: "How long should blog posts be for SEO?",
        answer:
          "Long enough to fully answer the question, which is often 1000 words or more for substantial topics. Depth matters more than a word count, so cover the topic better than the pages currently ranking.",
      },
      {
        question: "How often do I need to publish to see results?",
        answer:
          "Consistency beats bursts. A steady cadence, even a few quality posts a month, compounds over time. Blog SEO is a medium-term play, so expect meaningful traffic over several months of consistent publishing.",
      },
    ],
  },
  {
    slug: "conversion-add-social-media-presence",
    title: "How to Add Social Media Links and Share Tags to Your Website",
    excerpt:
      "Missing social links make a business look less established and waste free exposure. Here is how to connect your site to your social presence.",
    category: "Conversion",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>When a website has no links to active social profiles and no preview when shared, it looks less established and gives up free exposure. Connecting your site to your social presence is quick, builds credibility, and makes your content look good every time someone shares it.</p>
<h2>Why it matters</h2>
<p>Active social profiles are a trust signal: they show a real, current business. Social links in your schema also act as "sameAs" references that help search engines and AI confirm your identity. And proper share tags mean a link to your site shows a clean title, description, and image instead of a broken-looking preview.</p>
<h2>How to set it up</h2>
<ol>
<li><strong>Claim and complete your profiles.</strong> Secure your business name on the platforms your customers actually use and fill the profiles out fully.</li>
<li><strong>Add social links to your site.</strong> Put icons in your footer linking to your active profiles. Open them in a new tab with rel="noopener noreferrer" for security.</li>
<li><strong>Add Open Graph tags.</strong> On your main pages, set the title, description, and a 1200 by 630 pixel image so Facebook and LinkedIn shares look right.</li>
<li><strong>Add Twitter Card tags.</strong> Use the summary_large_image card type so links display with a large preview image.</li>
<li><strong>Add share buttons where they help.</strong> On blog posts and shareable pages, make it easy for visitors to spread your content.</li>
</ol>
<h2>Verify the previews</h2>
<p>Test your pages in the Facebook Sharing Debugger and a Twitter card validator to confirm the image and text render correctly. One caution: only link to profiles you keep active. A link to a profile last posted to three years ago can hurt more than help, so link the live ones and let the dormant ones go.</p>`,
    faq: [
      {
        question: "Do social media links help SEO?",
        answer:
          "Social links are not a direct ranking factor, but they act as identity signals that help search engines and AI confirm your business, and they build trust with visitors. Link only to active, complete profiles.",
      },
      {
        question: "What are Open Graph and Twitter Card tags?",
        answer:
          "They control how your pages look when shared on social platforms, setting the title, description, and preview image. Without them, shared links can look broken. Use a 1200 by 630 pixel image and the large-image card type.",
      },
    ],
  },

  // ----------------------------------------------------------------------
  // AI VISIBILITY
  // ----------------------------------------------------------------------
  {
    slug: "ai-improve-website-readability-for-assistants",
    title: "How to Make Your Website Readable by AI Assistants",
    excerpt:
      "ChatGPT, Gemini, and Perplexity increasingly recommend businesses. Here is how to structure your site so AI understands, cites, and recommends you.",
    category: "AI Visibility",
    difficulty: "medium",
    readingTime: "7 min",
    updatedAt: "2026-06-21",
    fixesSlug: "ai-readability",
    bodyHtml: `<p>More and more people ask AI assistants like ChatGPT, Google Gemini, Perplexity, and Siri to recommend a business instead of scrolling through search results. If those systems cannot clearly understand who you are and what you do, they will recommend a competitor they can parse. Making your site AI-readable is the newest, fastest-growing piece of getting found.</p>
<h2>Why AI readability matters now</h2>
<p>AI assistants build answers by reading structured data, clear content, and corroborating sources. A site with messy structure and no schema is hard for them to summarize confidently, so they skip it. A clearly structured, well-marked-up site gets cited and recommended.</p>
<h2>How to improve it</h2>
<ol>
<li><strong>State the basics plainly.</strong> Your homepage's first paragraph should clearly name your business, what you do, where you operate, and your main services. AI rewards explicitness over clever copy.</li>
<li><strong>Use a clean heading hierarchy.</strong> One H1, logical H2s and H3s, and content organized so a machine can follow the structure.</li>
<li><strong>Add comprehensive schema.</strong> LocalBusiness schema with full details, plus Service and FAQ schema where relevant, gives AI a structured fact sheet about you.</li>
<li><strong>Publish real FAQ content.</strong> At least ten genuine question-and-answer pairs, marked up with FAQ schema, in the natural language customers use.</li>
<li><strong>Add sameAs links and keep NAP consistent.</strong> Point your schema to your verified profiles and make sure your name, address, and phone match everywhere, so AI can confirm you are one trustworthy entity.</li>
</ol>
<h2>Test it</h2>
<p>Ask the major assistants about your business and your services and see what they return. If they say nothing or get it wrong, that usually means incomplete schema, weak citations, or thin content. Fix those and re-check, since AI responses typically take a few weeks to reflect changes.</p>
<p>Strelva's free audit includes an AI-readability check, so you can see exactly where assistants are losing the thread on your site.</p>`,
    faq: [
      {
        question: "How do I get my business recommended by ChatGPT or Gemini?",
        answer:
          "Make your site easy to parse: clear structure, complete LocalBusiness and FAQ schema, consistent name, address, and phone across the web, real reviews, and explicit content stating who you are and what you do. AI corroborates multiple sources before recommending.",
      },
      {
        question: "How long until AI assistants reflect my changes?",
        answer:
          "Usually two to eight weeks. AI systems need to recrawl your site and see corroborating signals from directories and profiles before they confidently update what they say about your business.",
      },
    ],
  },
  {
    slug: "ai-add-local-business-schema",
    title: "How to Add LocalBusiness Schema to Your Website",
    excerpt:
      "LocalBusiness schema is a structured fact sheet that helps search engines and AI understand your business. Here is how to add and validate it.",
    category: "AI Visibility",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "ai-readability",
    bodyHtml: `<p>LocalBusiness schema is structured data (a small block of JSON-LD code) that hands search engines and AI a clean fact sheet about your business: name, address, phone, hours, type, and location. It is one of the most valuable pieces of markup a local business can add, and it powers richer search appearances and more accurate AI answers.</p>
<h2>Why it matters</h2>
<p>Without schema, machines have to guess at your details from scattered page text. With it, they get unambiguous facts. That improves how you show up in search, helps your eligibility for rich results, and gives AI assistants the structured data they rely on to recommend you confidently.</p>
<h2>How to add it</h2>
<ol>
<li><strong>Gather your details.</strong> Exact business name, address, phone, hours, website, geographic coordinates, and the most specific business type from schema.org (for example "Plumber" or "Dentist," not just "LocalBusiness").</li>
<li><strong>Generate the JSON-LD.</strong> Build a LocalBusiness schema block with all those fields. Make sure the data exactly matches your website and Google Business Profile.</li>
<li><strong>Add it to your pages.</strong> Place the JSON-LD in the head or body of your homepage and contact page. On most platforms you can paste it into a code or header section.</li>
<li><strong>Use a specific type.</strong> The more specific your @type, the more useful it is. Pick the closest match from the LocalBusiness subtypes.</li>
<li><strong>Validate.</strong> Run your pages through a schema validator and confirm there are no errors and all required fields are present.</li>
</ol>
<h2>Keep it accurate</h2>
<p>The cardinal rule: the schema must match what is visible on the page and on your Google Business Profile. Mismatched hours or an old phone number in your schema can undercut trust rather than build it. When your details change, update the schema in the same pass.</p>`,
    faq: [
      {
        question: "What is LocalBusiness schema?",
        answer:
          "A block of structured JSON-LD code that tells search engines and AI your business name, address, phone, hours, type, and location in a machine-readable format. It improves search appearance and AI accuracy.",
      },
      {
        question: "Should I use a specific schema type or just LocalBusiness?",
        answer:
          "Use the most specific subtype available for your business, such as Plumber, Restaurant, or Dentist. Specific types give search engines and AI more precise information than the generic LocalBusiness type.",
      },
    ],
  },
  {
    slug: "ai-add-faq-schema",
    title: "How to Add FAQ Schema (and Why It Still Matters for AI)",
    excerpt:
      "Google limited FAQ rich results, but FAQ schema still helps AI assistants and other engines understand your answers. Here is how to add it well.",
    category: "AI Visibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "ai-readability",
    bodyHtml: `<p>FAQ schema marks up your question-and-answer content so machines can read it cleanly. An important honesty note for 2026: Google now limits FAQ rich results (the expandable Q&A in search) to government and health authority sites. So the old reason to add FAQ schema is mostly gone, but a better one has taken its place: AI assistants and non-Google engines still use it to understand and surface your answers.</p>
<h2>Why bother if Google dropped the rich result</h2>
<p>AI assistants like ChatGPT and Perplexity, plus other search engines, parse FAQ schema to pull direct answers about your business. Well-structured Q&A content is some of the most AI-friendly content you can publish, because it mirrors exactly how people ask questions. The schema makes it unambiguous.</p>
<h2>How to add it</h2>
<ol>
<li><strong>Write real FAQ content.</strong> Use the actual questions customers ask, in their words, with clear, genuinely useful answers on the page.</li>
<li><strong>Create the FAQPage schema.</strong> Build a JSON-LD block listing each question and its answer, matching the visible content exactly.</li>
<li><strong>Add it to the page.</strong> Place the schema on the page that contains the FAQ content. Do not mark up questions that are not visible to users.</li>
<li><strong>Validate.</strong> Run it through a schema validator and fix any errors before publishing.</li>
</ol>
<h2>Keep it honest</h2>
<p>Only mark up questions and answers that genuinely appear on the page for users. Marking up hidden or fabricated Q&A violates guidelines and can backfire. Done right, FAQ schema is a low-effort way to make your content easy for AI to quote, which is increasingly where customers find their answers.</p>`,
    faq: [
      {
        question: "Does FAQ schema still show rich results in Google?",
        answer:
          "Only for government and health authority sites as of recent updates. For most businesses the search rich result is gone, but FAQ schema still helps AI assistants and other engines understand and surface your answers.",
      },
      {
        question: "Is it worth adding FAQ schema if there is no rich result?",
        answer:
          "Yes, for AI visibility. Question-and-answer content marked up with schema is highly readable for assistants like ChatGPT and Perplexity, which increasingly answer customer questions directly. Just keep it to real, visible Q&A.",
      },
    ],
  },
  {
    slug: "ai-add-review-rating-schema",
    title: "How to Add Review and Rating Schema for Star Ratings in Search",
    excerpt:
      "Review schema can display star ratings in search results and feed AI trust signals. Here is how to add it correctly and within the rules.",
    category: "AI Visibility",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "ai-readability",
    bodyHtml: `<p>Review schema marks up the ratings and reviews on your site so search engines can show star ratings in results and AI can factor your reputation into recommendations. Those stars make your listing stand out and can meaningfully lift click-through rates. But review schema has strict rules, and getting them wrong can hurt you.</p>
<h2>Why it matters</h2>
<p>Stars in search results draw the eye and signal trust before anyone clicks. For AI assistants, structured review data is a clear signal of reputation. Both reward businesses that display real reviews and mark them up honestly.</p>
<h2>How to add it correctly</h2>
<ol>
<li><strong>Understand the rules first.</strong> The reviews must be genuine, collected by you, and visibly displayed on the page. Do not mark up reviews pulled from third-party sites you do not control, and do not self-serve ratings without real review content.</li>
<li><strong>Display reviews on your site.</strong> Show real customer reviews on relevant pages: service pages, product pages, or a testimonials page.</li>
<li><strong>Create the schema.</strong> Add Review or AggregateRating schema to every page that shows reviews, with the rating value and review count matching the visible content exactly.</li>
<li><strong>Validate.</strong> Run a schema validator and confirm zero errors before publishing.</li>
<li><strong>Keep it in sync.</strong> When your review data changes, update the schema so the numbers always match what visitors see.</li>
</ol>
<h2>The honesty rule</h2>
<p>The ratingValue and reviewCount in your schema must match real reviews shown on the page. Inflated or invented ratings violate Google's guidelines and can trigger a manual action that removes all your rich results. Real reviews, honestly marked up, are the only version of this that pays off.</p>`,
    faq: [
      {
        question: "Can I add review schema for my Google reviews?",
        answer:
          "You should mark up reviews you collect and display on your own site, not reviews scraped from Google or other third-party platforms you do not control. The reviews must be genuine and visible on the page.",
      },
      {
        question: "Why are my star ratings not showing in search?",
        answer:
          "Common reasons are schema that does not match visible content, missing required fields, or Google choosing not to show them. Make sure real reviews are on the page, the schema validates cleanly, and the rating and count match exactly.",
      },
    ],
  },
  {
    slug: "ai-add-product-service-schema",
    title: "How to Add Product and Service Schema to Your Website",
    excerpt:
      "Product and service schema helps search engines and AI understand exactly what you offer, with pricing and availability. Here is how to add it.",
    category: "AI Visibility",
    difficulty: "medium",
    readingTime: "6 min",
    updatedAt: "2026-06-21",
    fixesSlug: "ai-readability",
    bodyHtml: `<p>Product and Service schema spell out exactly what you sell or provide in a structured format. For products, it can trigger rich results with pricing, availability, and ratings right in search. For services, it gives AI assistants a clear list of what you do so they can recommend you for the right queries. Both make your offerings legible to machines.</p>
<h2>Why it matters</h2>
<p>Search engines and AI cannot recommend what they do not understand. Marking up your products and services turns vague page text into precise, structured facts: this service, this provider, this price. That precision is what gets you surfaced for specific searches and AI recommendations.</p>
<h2>How to add it</h2>
<ol>
<li><strong>Decide which types you need.</strong> Use Product schema if you sell physical products, and Service schema for the services you offer. Many local businesses need Service schema more than Product.</li>
<li><strong>Add Service schema to service pages.</strong> Include the service name, a description, and the provider (your business). Add one per service page, and optionally summarize on the homepage.</li>
<li><strong>Add Product schema to product pages.</strong> Put it on each individual product page, not just category pages, with name, image, and an offers block.</li>
<li><strong>Add Offer schema for pricing.</strong> Include price and availability where you show them, and make sure the schema price exactly matches the page.</li>
<li><strong>Use specific types and validate.</strong> Pick the most specific @type for your industry, then run a schema validator and clear all errors.</li>
</ol>
<h2>Keep it matched and current</h2>
<p>As with all schema, the numbers in your markup must match what is on the page. Mismatched prices or ratings break trust and can cause errors in Search Console. Set a reminder to update schema whenever your prices or offerings change, so your structured data never drifts from reality.</p>`,
    faq: [
      {
        question: "Do I need Product schema or Service schema?",
        answer:
          "Use Product schema if you sell physical goods on individual product pages, and Service schema for the services you provide. Many local and professional businesses primarily need Service schema, with Product reserved for actual products.",
      },
      {
        question: "Does product schema price need to match the page?",
        answer:
          "Yes, exactly. The price and availability in your schema must match what the visitor sees on the page. Mismatches violate guidelines and cause errors, so update the schema whenever your pricing changes.",
      },
    ],
  },

  // ----------------------------------------------------------------------
  // TRUST & CREDIBILITY
  // ----------------------------------------------------------------------
  {
    slug: "trust-encourage-customer-reviews",
    title: "How to Get More Google Reviews From Happy Customers",
    excerpt:
      "Reviews are the number one factor customers use to choose a local business. Here is a simple system to generate a steady flow of them.",
    category: "Trust & Credibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Reviews are the single biggest factor most people use to choose a local business. They also influence local rankings. Yet most happy customers never leave one, simply because no one asked. The fix is a small, repeatable system that makes asking easy and consistent.</p>
<h2>Why reviews matter so much</h2>
<p>A steady stream of recent, positive reviews signals quality to both customers and Google. Volume, recency, and your responses all play a role. The goal is not a one-time burst but a reliable trickle of a few new reviews every month.</p>
<h2>How to build the system</h2>
<ol>
<li><strong>Get your direct review link.</strong> Create the short Google review link that takes a customer straight to the review box, and keep it handy.</li>
<li><strong>Make a request template.</strong> Write a short, friendly email and text message you can send after a job, with the link and a clear ask.</li>
<li><strong>Ask at the right moment.</strong> Send the request right after you have delivered great service, while the experience is fresh and positive.</li>
<li><strong>Add QR codes to physical materials.</strong> Put the review link as a QR code on receipts, business cards, or in-store signage so it is effortless in person.</li>
<li><strong>Train your team to ask.</strong> A simple verbal ask at the end of a great interaction works well. Make it a normal part of the routine.</li>
<li><strong>Respond to every review.</strong> Replying within a day or two encourages more reviews and shows you care.</li>
</ol>
<h2>Stay within the rules</h2>
<p>Ask every customer, not just the ones you expect to rave, and never offer incentives for reviews or filter out unhappy customers, which violates Google's policies. A genuine ask at the right moment, repeated consistently, is all it takes to grow reviews by a few each month.</p>`,
    faq: [
      {
        question: "Is it against the rules to ask customers for reviews?",
        answer:
          "Asking is fine and encouraged. What is not allowed is offering incentives for reviews or selectively asking only customers you expect to be positive (review gating). Ask everyone, and never pay for reviews.",
      },
      {
        question: "How many reviews should I aim for each month?",
        answer:
          "A steady few new reviews per month is a healthy, sustainable target for most local businesses. Recency and consistency matter as much as total count, so a reliable trickle beats an occasional burst.",
      },
    ],
  },
  {
    slug: "trust-respond-to-google-reviews",
    title: "How to Respond to Google Reviews (Positive and Negative)",
    excerpt:
      "Responding to reviews improves rankings and makes you look more trustworthy. Here is how to reply to every type of review the right way.",
    category: "Trust & Credibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Responding to reviews is one of the most underrated trust-builders available. Businesses that reply to reviews are seen as significantly more trustworthy, and the activity supports local rankings. Every review is a chance to show prospective customers how you treat people, especially when things go wrong.</p>
<h2>Why responding matters</h2>
<p>Future customers read your responses as much as the reviews themselves. A gracious reply to praise and a calm, helpful reply to criticism both signal a real business that cares. Silence signals the opposite.</p>
<h2>How to respond to each type</h2>
<ol>
<li><strong>Positive reviews (4 to 5 stars).</strong> Thank the customer personally, mention a specific detail from their review, and keep it warm and brief. Avoid copy-pasting the same reply to everyone.</li>
<li><strong>Neutral reviews (3 stars).</strong> Thank them, acknowledge their feedback, and note any improvement you are making. Show you listened.</li>
<li><strong>Negative reviews (1 to 2 stars).</strong> Stay calm and professional. Apologize for their experience, take the conversation offline with a contact, and never argue. A measured response to a bad review often impresses readers more than the praise does.</li>
<li><strong>Fake or policy-violating reviews.</strong> If a review breaks Google's policies (spam, off-topic, fake), report it through the dashboard rather than fighting it in the reply.</li>
</ol>
<h2>Make it a routine</h2>
<p>Aim to respond within a day or two. Create a few flexible templates to speed things up, but always personalize them so responses never read as identical boilerplate. Set up notifications so new reviews never sit unanswered, and treat the review section as an ongoing conversation with future customers.</p>`,
    faq: [
      {
        question: "Should I respond to every Google review?",
        answer:
          "Yes. Respond to all negative and neutral reviews promptly and professionally, and personally thank a strong majority of positive ones. Consistent responses build trust and support local rankings.",
      },
      {
        question: "How should I handle a negative review?",
        answer:
          "Stay calm, apologize for the experience, and move the conversation offline with a contact method. Never argue publicly. A composed, helpful reply often impresses future readers more than the original complaint hurts you.",
      },
    ],
  },
  {
    slug: "trust-add-trust-signals",
    title: "How to Add Trust Signals That Increase Conversions",
    excerpt:
      "Reviews, certifications, and credentials reduce buyer hesitation and lift conversions. Here is which trust signals to add and where.",
    category: "Trust & Credibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Every visitor arrives with some hesitation: is this business real, capable, and safe to hire or buy from? Trust signals (reviews, certifications, credentials, and proof of work) answer that question before they have to ask it. Adding them is one of the most reliable ways to lift conversions without changing anything else.</p>
<h2>Why trust signals convert</h2>
<p>People buy from businesses they believe. Visible proof reduces the perceived risk of choosing you, which is often the real reason a hesitant visitor leaves. The more credible you look, the easier the decision.</p>
<h2>What to add and where</h2>
<ol>
<li><strong>Customer testimonials and reviews.</strong> Put real reviews on your homepage and key pages. Specific, named testimonials beat vague ones.</li>
<li><strong>Professional certifications and badges.</strong> Display the licenses, certifications, and qualifications relevant to your field.</li>
<li><strong>Association memberships.</strong> Show trade or industry memberships, which lend borrowed credibility.</li>
<li><strong>Security badges near forms and checkout.</strong> If you collect information or payment, visible security reassurance reduces drop-off.</li>
<li><strong>Business credentials.</strong> License numbers, insurance, and years in business, especially for trades, where customers worry about this directly.</li>
<li><strong>Social proof numbers and case studies.</strong> "Over 500 jobs completed" or a short portfolio gives concrete evidence of capability.</li>
</ol>
<h2>Keep it real and current</h2>
<p>Only display credentials and badges you genuinely hold, and keep numbers honest. False trust signals destroy trust the moment they are caught. Pair these with your legal pages (privacy policy and terms) so the whole site reads as a legitimate, established business.</p>`,
    faq: [
      {
        question: "What are the most effective trust signals?",
        answer:
          "Real customer reviews and testimonials, relevant certifications and licenses, security reassurance near forms, and concrete proof of work like case studies or completed-job counts. For trades, visible license and insurance details matter most.",
      },
      {
        question: "Where should trust signals appear on a website?",
        answer:
          "Testimonials on the homepage and key landing pages, credentials and badges near the relevant claims, and security reassurance next to forms and checkout. Place each signal where a visitor would otherwise hesitate.",
      },
    ],
  },
  {
    slug: "trust-add-privacy-policy-legal-pages",
    title: "How to Add a Privacy Policy and Legal Pages to Your Website",
    excerpt:
      "Missing legal pages look unprofessional and can break regulations. Here is which pages you need and how to add them properly.",
    category: "Trust & Credibility",
    difficulty: "easy",
    readingTime: "5 min",
    updatedAt: "2026-06-21",
    fixesSlug: "trust",
    bodyHtml: `<p>Legal pages are not glamorous, but their absence is conspicuous. A missing privacy policy makes a business look unprofessional, can violate privacy regulations, and may block you from using certain ad and analytics tools that require one. Customers also expect to see these pages, and their presence is a quiet trust signal.</p>
<h2>Why legal pages matter</h2>
<p>If you collect any visitor information (contact forms, analytics, email signups) you are handling personal data and a privacy policy is expected and often legally required. Terms of service set the rules for using your site and services. Together they signal a legitimate, established operation.</p>
<h2>How to add them</h2>
<ol>
<li><strong>Create a privacy policy.</strong> Explain what data you collect, why, how you use it, and how visitors can contact you about it. Use a reputable generator as a starting point, then adapt it to what you actually do.</li>
<li><strong>Create terms of service.</strong> Set out the rules and limitations for using your website and services.</li>
<li><strong>Add licensing and insurance info if applicable.</strong> For trades and regulated fields, display the relevant credentials.</li>
<li><strong>Add any required disclosures.</strong> Affiliate disclosures, accessibility statements, or industry-specific notices where they apply.</li>
<li><strong>Link them in your footer.</strong> Legal pages should be reachable from the footer on every page.</li>
<li><strong>Collect consent where needed.</strong> Forms that gather personal data should include appropriate consent, and add a cookie notice if your region requires one.</li>
</ol>
<h2>A note on accuracy</h2>
<p>Generated templates are a fine starting point, but make sure the final policy reflects what your business actually does with data. For anything high-stakes (collecting sensitive data, operating in strict jurisdictions) have a professional review it. A privacy policy that contradicts your real practices is worse than a generic accurate one.</p>`,
    faq: [
      {
        question: "Does my small business website really need a privacy policy?",
        answer:
          "If you collect any visitor data, including through contact forms or analytics, then yes. A privacy policy is expected, often legally required, and necessary for tools like Google Analytics and ad platforms. It is also a basic trust signal.",
      },
      {
        question: "Can I use a free privacy policy generator?",
        answer:
          "A reputable generator is a fine starting point, but adapt the result to reflect what your business actually does with data. For sensitive data or strict jurisdictions, have a professional review it so the policy matches reality.",
      },
    ],
  },
];
