"use client";

import { useState } from "react";
import { AiMirror } from "../outcomes/AiMirror";
import { LocationHeatmap } from "../outcomes/LocationHeatmap";
import { LoopRibbon } from "../outcomes/LoopRibbon";
import { PriceSheet } from "../outcomes/PriceSheet";
import { RatingTrend } from "../outcomes/RatingTrend";
import { ReplyPattern } from "../outcomes/ReplyPattern";
import { SundayPictureText } from "../outcomes/SundayPictureText";
import { BAKERY_AI_MIRROR, BAKERY_AI_MIRROR_EMPTY, BAKERY_LEADS, BAKERY_LOOP, BAKERY_LOOP_EMPTY, BAKERY_LOOP_PARTIAL, BAKERY_PRICE_TERMS, BAKERY_RATINGS, BAKERY_REPORT, COMFORT_AIR_LOCATIONS } from "./outcomes-fixture";
import styles from "./outcomes-gallery.module.css";

/** Every outcome component with fictional fixture data. Local preview only; nothing here acts. */
export function OutcomesGallery() {
  const [log, setLog] = useState<string | null>(null);
  return <main className={styles.page}>
    <header className={styles.intro}>
      <p>Local interface preview · fictional data · no live actions</p>
      <h1>Outcome components</h1>
      <p>Contract: docs/design/outcome-components.md. Scroll to trigger each entrance; reduced motion shows end states.</p>
      {log ? <p role="status" className={styles.log}>{log}</p> : null}
    </header>

    <section className={styles.group} aria-label="Loop ribbon">
      <h2>Loop ribbon · Home</h2>
      <LoopRibbon {...BAKERY_LOOP} />
      <div className={styles.pair}>
        <LoopRibbon {...BAKERY_LOOP_PARTIAL} />
        <LoopRibbon {...BAKERY_LOOP_EMPTY} />
      </div>
    </section>

    <section className={styles.group} aria-label="AI mirror">
      <h2>AI mirror · Website</h2>
      <div className={styles.pair} data-wide="first">
        <AiMirror data={BAKERY_AI_MIRROR} />
        <AiMirror data={BAKERY_AI_MIRROR_EMPTY} />
      </div>
    </section>

    <section className={styles.group} aria-label="Reply pattern and rating trend">
      <h2>Reply pattern · Inquiries &nbsp;/&nbsp; Rating trend · Publishing</h2>
      <div className={styles.pair}>
        <ReplyPattern leads={BAKERY_LEADS} line="Every lead answered before they could call someone else." />
        <RatingTrend points={BAKERY_RATINGS} cutoffNote="where 31% stop looking" crossingNote="Jun · same-day replies start" side={{ label: "same-day replies", value: "38 of 38" }} />
      </div>
    </section>

    <section className={styles.group} aria-label="Sunday picture text and price sheet">
      <h2>Sunday picture text · Phone &nbsp;/&nbsp; Price sheet · Make real</h2>
      <div className={styles.phones}>
        <SundayPictureText report={BAKERY_REPORT} reply="YES" />
        <div className={styles.sheetSlot}>
          <PriceSheet title="Online booking with deposits" price={120} cadence="once" cadenceDetail="then in your plan" terms={BAKERY_PRICE_TERMS}
            previewLabel="Preview: booking page on your site" slider="always"
            onConfirm={() => new Promise<void>(resolve => setTimeout(() => { setLog("Price sheet confirmed (preview: nothing was bought)."); resolve(); }, 400))} />
        </div>
      </div>
    </section>

    <section className={styles.group} aria-label="Location heatmap">
      <h2>Location heatmap · Agency home</h2>
      <LocationHeatmap eyebrow="Comfort Air · 4 locations · reply time by day" rows={COMFORT_AIR_LOCATIONS}
        suggestion="Strelva can route its leads to Amherst's team."
        onAction={id => setLog(`Action requested for ${id} (preview: nothing was routed).`)} />
    </section>
  </main>;
}
