"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { StComposerBar, StComposerDock, StEmpty, StHead, StHold, StLabel, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSegmented, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import styles from "./website-panels-preview.module.css";

export type WebsitePanelsView = "media" | "look" | "articles" | "results";
export type WebsitePanelsState = "ready" | "loading" | "empty" | "error" | "permission";

// Fictional canon data. No reader or action below contacts a client or provider.
const DOMAIN = "attymooney.com";
const TITLES: Record<WebsitePanelsView, string> = { media: "Photos and files", look: "The look", articles: "Articles", results: "Results" };
const META: Record<WebsitePanelsView, string> = {
  media: "18 photos · 3 PDFs · 2 photos have no description",
  look: "Fonts and colors read from your live site · changes go through review",
  articles: "attymooney.com/articles · 4 published · 1 draft waiting on you",
  results: "Visits from the site itself · searches from Google Search Console · last 12 weeks",
};
const MEDIA = [
  { name: "Home, top of page", detail: "Used on Home", type: "image", used: true, description: true, preview: "home" },
  { name: "Services", detail: "Used on Home, Services", type: "image", used: true, description: true, preview: "services" },
  { name: "IMG_2231.jpg", detail: "Used on About · describe it so search and screen readers can read it", type: "image", used: true, description: false },
  { name: "IMG_2240.jpg", detail: "Not used", type: "image", used: false, description: false },
  { name: "Mediation guide.pdf", detail: "Used on Resources", type: "pdf", used: true, description: true },
];
const COLORS = [
  { name: "Brown", value: "#5A3B2B", use: "buttons, links" }, { name: "Ink", value: "#2B2522", use: "text" },
  { name: "Paper", value: "#FBFAF7", use: "background" }, { name: "Sand", value: "#F3E6D9", use: "highlights" },
];
const ARTICLES = [
  { title: "What happens in a mediation session", date: "Oct 8", draft: true, detail: "Draft by Strelva from your FAQ answers" },
  { title: "Mediation or litigation: how to choose", date: "Sep 12", draft: false, detail: "Published" },
  { title: "Preparing for your first session", date: "Aug 2", draft: false, detail: "Published" },
  { title: "Workplace mediation for small teams", date: "Jun 20", draft: false, detail: "Published" },
];
const WEEKS = [32, 35, 28, 39, 49, 43, 33, 53, 60, 45, 57, 64];
const SEARCHES = [
  { query: "mediator buffalo ny", clicks: 21, rank: "4.2" }, { query: "workplace mediation buffalo", clicks: 9, rank: "6.8" },
  { query: "the mooney firm", clicks: 8, rank: "1.0" }, { query: "mediation cost per session", clicks: 3, rank: "11.5" },
];

function PageObject({ article, small = false }: { article?: string; small?: boolean }) {
  return <div className={styles.clientPage} data-small={small || undefined}>
    <div className={styles.clientNav}><strong>The Mooney Firm</strong><span>Attorneys　Workplace mediation　About　Fees　Contact</span><b>Get in touch</b></div>
    {article ? <div className={styles.articleBody}><h2>{article}</h2><p>A session starts with everyone together. Sheri explains the ground rules and what stays confidential. Then each side gets uninterrupted time to describe the dispute in their own words.</p><p>Most sessions then move to separate rooms. Sheri goes between them, testing proposals privately until both sides can accept the same terms.</p><div className={styles.sourceQuote}>“Separate rooms” comes from your intake FAQ, answer 4</div></div>
      : <><div className={styles.clientHero}><h2>The Mooney Firm</h2><p>Experienced. Independent. Neutral.</p></div>{small ? <div className={styles.clientServices}>Services<div>Legal matter mediation</div><div>Workplace mediation</div></div> : null}</>}
  </div>;
}

function BrowserObject({ article }: { article?: string }) {
  return <StSurface pad={false} label={article ? "Article preview" : "Live site preview"}><div className={styles.browserBar}><span aria-hidden="true">● ● ●</span><StMono>{DOMAIN}{article ? "/articles/what-happens-in-a-mediation-session" : ""}</StMono></div><PageObject article={article} /></StSurface>;
}

/** Full B3–B6 compositions with fictional data. Actions alter only this local preview. */
export function WebsitePanelsPreview({ view, state, mode }: { view: WebsitePanelsView; state: WebsitePanelsState; mode: "light" | "dark" }) {
  const [filter, setFilter] = useState<"all" | "used" | "unused" | "pdf">("all");
  const [selectedArticle, setSelectedArticle] = useState(0);
  const [published, setPublished] = useState(false);
  const [ask, setAsk] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const readOnly = state === "permission";
  const visibleMedia = MEDIA.filter(item => filter === "all" ? item.type === "image" : filter === "used" ? item.used : filter === "unused" ? !item.used : item.type === "pdf");
  function previewAction(text: string) { setNotice(`${text} Preview only; nothing on the site changed.`); }
  const article = ARTICLES[selectedArticle]!;
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <StrelvaShell title="" active="home" systemsReleased businessContext="The Mooney Firm" accountName="Sheri" signOut={null} appBase="/preview/strelva" pinned={[{ id: "website", title: DOMAIN, kind: "website", href: "/preview/strelva/website-panels", current: true }, { id: "inquiries", title: "Inquiries", kind: "inquiries", href: "/preview/strelva?scenario=systems" }]}>
      <StPage>
        <StHead crumb={{ label: DOMAIN, href: "/preview/strelva?scenario=systems" }} title={TITLES[view]} meta={state === "empty" ? "No data recorded for this site yet" : META[view]} />
        {readOnly ? <StNotice>You can read this site’s information. Only an owner or admin can change it.</StNotice> : null}
        {state === "loading" ? <section className={styles.loading} aria-busy="true" aria-label={`Loading ${TITLES[view].toLowerCase()}`}><StSkeleton width="60%" /><StSkeleton /><StSkeleton width="85%" /></section>
          : state === "error" ? <StNotice tone="critical">Couldn’t read {TITLES[view].toLowerCase()} just now. Nothing about the site has changed. <StTextButton onClick={() => previewAction("Retry selected.")}>Try again</StTextButton></StNotice>
            : state === "empty" ? <StEmpty action={view === "media" ? <StPill variant="soft" onClick={() => upload.current?.click()}>Upload a file</StPill> : <StTextButton onClick={() => previewAction("Ask Strelva opened.")}>Ask Strelva</StTextButton>}>{view === "media" ? "No photos or files are recorded for this site yet." : view === "articles" ? "No articles yet. Ask Strelva for an article idea." : view === "look" ? "The site’s fonts and colors have not been read yet." : "No visits or searches have been reported yet. Results show here once the connected sources report them."}</StEmpty>
              : view === "media" ? <>
                <div className={styles.toolbar}><StSegmented value={filter} onChange={setFilter} label="Filter photos and files" options={[{ value: "all", label: "Everything" }, { value: "used", label: "Used on the site" }, { value: "unused", label: "Not used" }, { value: "pdf", label: "PDFs" }]} /><StPill variant="soft" disabled={readOnly} onClick={() => upload.current?.click()}>Upload</StPill></div>
                <div className={styles.mediaGrid}>{visibleMedia.map(item => <div key={item.name} className={styles.mediaItem}><div className={styles.thumbnail} data-description={item.description}>{item.preview === "home" ? <div className={styles.miniPage}><PageObject small /></div> : item.preview === "services" ? <div className={styles.documentPreview}><strong>What is mediation?</strong><p>An independent, neutral mediator helps people resolve disputes and choose their own next step.</p><strong>A different path</strong><p>Get in touch to talk about your situation.</p></div> : <StMono tone={item.description ? undefined : "need"}>{item.type === "pdf" ? "PDF" : "no description"}</StMono>}</div><strong>{item.name}</strong><p>{item.detail}</p></div>)}</div>
                <div className={styles.inlineNote}><StState kind="need">2 photos have no description.</StState><span>Strelva wrote one for each from what’s in the photo.</span><StTextButton disabled={readOnly} onClick={() => previewAction("Description review opened.")}>Review descriptions</StTextButton></div>
              </> : view === "look" ? <div className={styles.lookGrid}>
                <div className={styles.lookDetails}><StSection title="Fonts"><StRows label="Site fonts"><StRow title={<span className={styles.serif}>Cormorant Garamond</span>} kind="Headings" end={<StTextButton disabled={readOnly} onClick={() => previewAction("Heading font change requested.")}>Change</StTextButton>} /><StRow title="DM Sans" kind="Text" end={<StTextButton disabled={readOnly} onClick={() => previewAction("Text font change requested.")}>Change</StTextButton>} /></StRows></StSection>
                  <StSection title="Colors"><div className={styles.colors}>{COLORS.map(color => <div key={color.name} className={styles.colorRow}><span className={styles.swatch} style={{ background: color.value }} /><span>{color.name}<br /><StMono>{color.value} · {color.use}</StMono></span></div>)}</div></StSection><StState kind="live">Text on every color passes contrast for reading</StState></div>
                <BrowserObject />
              </div> : view === "articles" ? <div className={styles.articlesGrid}>
                <div className={styles.articleList}><StRows label="Articles">{ARTICLES.map((item, index) => <StRow key={item.title} onClick={() => setSelectedArticle(index)} selected={selectedArticle === index} title={item.title} detail={index === 0 && published ? "Published" : item.detail} lead={<StState kind={item.draft && !published ? "need" : "live"}><span className="sr-only">{item.draft && !published ? "Draft" : "Published"}</span></StState>} end={<StMono>{item.date}</StMono>} />)}</StRows><StTextButton disabled={readOnly} onClick={() => previewAction("Article idea requested.")}>Ask Strelva for an article idea</StTextButton></div>
                <div className={styles.articlePreview}><div className={styles.toolbar}><StMono>{article.draft && !published ? "Draft · 640 words · every fact traced to your business record" : "Published"}</StMono>{article.draft && !published ? <div className={styles.articleActions}><StTextButton disabled={readOnly} onClick={() => previewAction("Draft kept for later.")}>Not yet</StTextButton><StHold label="Hold to publish" disabled={readOnly} onAccept={() => { setPublished(true); previewAction("Article published in this preview."); }} /></div> : null}</div><BrowserObject article={article.title} /></div>
              </div> : <>
                <div className={styles.resultsGrid}><div className={styles.visits}><div className={styles.toolbar}><div><strong className={styles.visitNumber}>64</strong><p>Visits last week · weekly visits, 12 weeks</p></div><StSegmented value="weeks" label="Visits period" options={[{ value: "weeks", label: "12 weeks" }, { value: "year", label: "Year" }]} disabledValues={["year"]} disabledReason="The fictional preview contains 12 weeks only" onChange={() => undefined} /></div>
                  <div className={styles.barChart} role="img" aria-label="Weekly visits over 12 weeks: 32, 35, 28, 39, 49, 43, 33, 53, 60, 45, 57, 64.">{WEEKS.map((visits, index) => <div key={index} className={styles.bar} style={{ height: `${visits / 64 * 100}%` }} title={`${visits} visits`} />)}</div><div className={styles.chartLabels}><StMono>Jul 21</StMono><StMono>Aug 18</StMono><StMono>Sep 15</StMono><StMono>Oct 13</StMono></div><p className={styles.chartNote}><Info size={14} aria-hidden="true" />Visits rose after the Sep 12 article. Strelva can’t say that one caused the other.</p>
                </div><StSection title="What people searched"><table className={styles.searchTable}><thead><tr><th scope="col">Search</th><th scope="col">Clicks</th><th scope="col">Rank</th></tr></thead><tbody>{SEARCHES.map(search => <tr key={search.query}><th scope="row">{search.query}</th><td><StMono tone="text">{search.clicks}</StMono></td><td><StMono>{search.rank}</StMono></td></tr>)}</tbody></table></StSection></div>
                <StNotice><div className={styles.inlineNote}><StLabel as="span">Health</StLabel><span>10 of 10 pages load · fastest page 0.8 s, slowest 2.1 s (About, large photo) · no broken links</span><StTextButton disabled={readOnly} onClick={() => previewAction("About page improvement requested.")}>Make About faster</StTextButton></div></StNotice>
              </>}
        <input ref={upload} className="sr-only" type="file" aria-label="Upload a photo or PDF" accept="image/*,application/pdf" disabled={readOnly} onChange={event => { const file = event.target.files?.[0]; if (file) previewAction(`${file.name} selected locally.`); }} />
        {notice ? <StNotice><span role="status">{notice}</span></StNotice> : null}
        <p className={styles.fixtureNote}>Fictional preview · no live data or writes. Photos, look, articles, weekly visits and search terms are not yet connected to this System page.</p>
      </StPage>
      <StComposerDock><StComposerBar scope={DOMAIN} placeholder={`Ask ${view === "media" ? "about photos" : view === "look" ? "to change the look" : `about ${view}`}`} value={ask} onChange={setAsk} disabled={readOnly} onSubmit={() => { previewAction("Your request was kept in this preview."); setAsk(""); }} /></StComposerDock>
    </StrelvaShell>
  </div>;
}
