"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { StEmpty, StTextField, StHead, StLabel, StNotice, StPill, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { PaymentLayout, PaymentSplit } from "@/experience/product/public-payment/PaymentLayout";
import styles from "@/experience/product/public-payment/payment.module.css";
import { depositFixture as fixture, type DepositPreviewState } from "./deposit-fixture";

/** No fetch, provider, card input, persisted reservation, or real payment. */
export function DepositPreview({ state }: { state: DepositPreviewState }) {
  const [simulated, setSimulated] = useState(false);
  const paid = state === "paid" || simulated;
  return <PaymentLayout brand={fixture.business} navigation={<><StTextButton href="#retreat">Workshops</StTextButton><StTextButton href="#price">Pricing</StTextButton></>}>
    <PaymentSplit description={<>
      <div id="retreat"><StHead title={<span className="font-display">{fixture.title}</span>} meta={fixture.date} /></div>
      <p className={styles.introduction}>{fixture.description}</p>
      <div id="price" className={styles.amounts}>
        <div className={styles.amount}><StLabel>Today</StLabel><span className={styles.amountValue}>{fixture.deposit}</span></div>
        <div className={styles.amount}><StLabel>At the studio</StLabel><span className={styles.amountValue}>{fixture.balance}</span></div>
      </div>
    </>}>
      {state === "loading" ? <StSurface><div className={styles.state} role="status" aria-label="Loading deposit details"><StSkeleton width="60%" /><StSkeleton /><StSkeleton /><span>Loading deposit details…</span></div></StSurface>
        : state === "empty" ? <StEmpty>No deposit is available for this retreat. Ask the studio about the next dates.</StEmpty>
          : state === "denied" ? <StNotice tone="critical">This payment link is unavailable. Ask the studio for a current link.</StNotice>
            : <StSurface pad={false} label="Deposit form"><div className={styles.form}>
              <h2 className={`${styles.formTitle} font-display`}>{paid ? "Your spot" : "Hold your spot"}</h2>
              {paid ? <><StState kind="live">Deposit received · simulated</StState><p className={styles.term}>This preview has not taken a payment or reserved a spot.</p></> : <>
                <StTextField label="Name" value={fixture.name} readOnly />
                <StTextField label="Email" type="email" value={fixture.email} readOnly />
                <StTextField label="Card" value={fixture.card} readOnly />
                <div className={styles.fieldsPair}><StTextField label="Expires" value={fixture.expires} readOnly /><StTextField label="CVC" value={fixture.cvc} readOnly /></div>
                {state === "error" ? <StNotice tone="critical">Payment could not be started. No charge was made in this preview.</StNotice> : null}
                <StPill size="lg" block onClick={() => setSimulated(true)}>Pay {fixture.deposit} and hold my spot</StPill>
                <p className={`${styles.caption} ${styles.security}`}><Lock size={12} aria-hidden="true" />{fixture.terms}</p>
              </>}
            </div></StSurface>}
    </PaymentSplit>
    <div className={styles.fixtureNote}><p className={styles.caption}>Fictional design preview. Card details are a read-only specimen. No payment or reservation is made.</p></div>
  </PaymentLayout>;
}
