"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import visitor from "@/experience/bookings/visitor.module.css";
import styles from "@/app/pay/business/payment.module.css";
import { depositFixture as fixture, type DepositPreviewState } from "./deposit-fixture";

/** No fetch, provider, card input, persisted booking, or real payment. */
export function DepositPreview({ state }: { state: DepositPreviewState }) {
  const [simulated, setSimulated] = useState(false);
  const paid = state === "paid" || simulated;
  return <VisitorBookingShell siteName={fixture.business} wide navigation={<><a className={visitor.text} href="#retreat">Workshops</a><a className={visitor.text} href="#price">Pricing</a></>}>
    <div className={styles.split}>
      <section className={styles.description}>
        <div id="retreat"><h1 className={visitor.title}>{fixture.title}</h1><p className={visitor.note}>{fixture.date}</p></div>
        <p className={visitor.intro}>{fixture.description}</p>
        <div id="price" className={styles.amounts}>
          <div className={styles.amount}><span className={visitor.label}>Today</span><span className={styles.amountValue}>{fixture.deposit}</span><p className={styles.terms}>{fixture.cancellationTerms}</p></div>
          <div className={styles.amount}><span className={visitor.label}>At the studio</span><span className={styles.amountValue}>{fixture.balance}</span></div>
        </div>
      </section>
      {state === "loading" ? <section className={`${visitor.surface} ${styles.form}`}><div className={styles.state} role="status" aria-label="Loading deposit details"><StSkeleton width="60%" /><StSkeleton /><StSkeleton /><span>Loading deposit details…</span></div></section>
        : state === "empty" ? <p className={visitor.notice}>No deposit is available for this retreat. Ask the studio about the next dates.</p>
          : state === "denied" ? <p className={`${visitor.notice} ${visitor.error}`} role="alert">This payment link is unavailable. Ask the studio for a current link.</p>
            : <section className={`${visitor.surface} ${styles.form}`} aria-label="Deposit form">
              <h2 className={visitor.title}>{paid ? "Your spot" : "Hold your spot"}</h2>
              {paid ? <><p role="status">Deposit received · simulated</p><p className={styles.terms}>This preview has not taken a payment or held a spot.</p></> : <>
                <label className={visitor.field}>Name<input className={visitor.input} value={fixture.name} readOnly /></label>
                <label className={visitor.field}>Email<input className={visitor.input} type="email" value={fixture.email} readOnly /></label>
                <label className={visitor.field}>Card<input className={visitor.input} value={fixture.card} readOnly /></label>
                <div className={styles.fieldsPair}><label className={visitor.field}>Expires<input className={visitor.input} value={fixture.expires} readOnly /></label><label className={visitor.field}>CVC<input className={visitor.input} value={fixture.cvc} readOnly /></label></div>
                {state === "error" ? <p className={`${visitor.notice} ${visitor.error}`} role="alert">Payment could not be started. No charge was made in this preview.</p> : null}
                <button className={`${visitor.button} ${visitor.block}`} type="button" onClick={() => setSimulated(true)}>Pay {fixture.deposit} and hold my spot</button>
                <p className={`${visitor.note} ${styles.security}`}><Lock size={14} aria-hidden="true" />{fixture.terms}</p>
              </>}
            </section>}
    </div>
    <p className={`${visitor.note} ${visitor.section}`}>Fictional design preview. Card details are a read-only specimen. No payment or booking is made.</p>
  </VisitorBookingShell>;
}
