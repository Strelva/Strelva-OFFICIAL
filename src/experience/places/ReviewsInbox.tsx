"use client";
/**
 * Reviews list beside the picked review (XA · S3). Holds only which review is
 * open and which view (waiting or replied); every write stays in
 * ReviewReplyForm and its existing endpoint.
 */
import { useState, type ReactNode } from "react";
import { XaDot, XaInitial, XaSegmented, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import type { ReviewView, SiteReviews } from "@/products/google-listing/client";
import { XaPlaceHead, XaStars, xaShortDate } from "./XaPlace";
import styles from "./xa-place.module.css";

export interface ReviewItem { site: SiteReviews; review: ReviewView }
const SOURCE: Record<ReviewView["source"], string> = { google: "Google", yelp: "Yelp", manual: "Added by hand" };

export function ReviewsInbox({ head, notes, getMore, items, initialOpen = false }: { head: { status: ReactNode; back: { href: string; label: string } }; notes?: ReactNode; getMore?: ReactNode; items: readonly (ReviewItem & { detail: ReactNode })[]; initialOpen?: boolean }) {
  const waiting = items.filter(item => !item.review.reply);
  const replied = items.filter(item => item.review.reply);
  const [view, setView] = useState<"waiting" | "replied">(waiting.length ? "waiting" : "replied");
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState(initialOpen);
  const shown = view === "waiting" ? waiting : replied;
  const current = shown.find(item => item.review.id === picked) ?? shown[0] ?? null;
  return <>
    <XaPlaceHead art={<XaSystemTile kind="reviews" size={56} />} title="Reviews" status={head.status} back={head.back}
      aside={waiting.length && replied.length ? <XaSegmented label="Which reviews" value={view} onChange={next => { setView(next); setPicked(null); setOpened(false); }}
        options={[{ value: "waiting", label: `Waiting ${waiting.length}` }, { value: "replied", label: `Replied ${replied.length}` }]} /> : undefined} />
    {notes}
    <div className={styles.split} data-open={opened || undefined}>
      <div className={styles.stack}>
        <ul className={styles.list} aria-label={view === "waiting" ? "Reviews waiting for a reply" : "Reviews with a reply"}>
          {shown.map(({ review }) => <li key={review.id}><button type="button" className={styles.pick} aria-current={current?.review.id === review.id || undefined} onClick={() => { setPicked(review.id); setOpened(true); }}>
            <span className={styles.pickLead}><XaInitial name={review.author} shape="round" size={36} color={review.reply ? "var(--st-faint)" : undefined} /></span>
            <span className={styles.pickTitle}>{review.author}</span>
            <time className={styles.pickMeta} dateTime={review.date}>{xaShortDate(review.date)}</time>
            <span className={styles.pickLine} data-quiet={Boolean(review.reply) || undefined}><XaStars rating={review.rating} /> {review.reply ? "Replied" : review.text || "A rating with no written review."}</span>
            {!review.reply ? <span className={styles.pickDot}><XaDot kind="waits" label="Waits for a reply" /></span> : null}
          </button></li>)}
        </ul>
        {getMore}
      </div>
      {current ? <section className={styles.detail} aria-label={`Review by ${current.review.author}`}>
        <span className={styles.backToList}><XaTextLink onClick={() => setOpened(false)}>Back to reviews</XaTextLink></span>
        <header className={styles.detailHead}>
          <XaInitial name={current.review.author} shape="round" size={40} />
          <div className={styles.detailWho}>
            <h2 className={styles.detailName}>{current.review.author}</h2>
            <span className={styles.detailMeta}>{SOURCE[current.review.source]} · <time dateTime={current.review.date}>{xaShortDate(current.review.date)}</time></span>
          </div>
          <XaStars rating={current.review.rating} />
        </header>
        {current.detail}
      </section> : null}
    </div>
  </>;
}
