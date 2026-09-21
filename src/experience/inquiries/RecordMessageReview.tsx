"use client";

import { useState } from "react";
import type { InquiryRecord } from "./contracts";
import { useInquiry } from "./context";
import { InquiryMessageReview, type InquiryMessageReviewAction } from "./InquiryMessageReview";
import styles from "./inquiry.module.css";

/** The same record owns each supervised message review and its resulting history. */
export function RecordMessageReview({ record }: { record: InquiryRecord }) {
  const { snapshot, can } = useInquiry();
  const [action, setAction] = useState<InquiryMessageReviewAction>("reply");
  const [completed, setCompleted] = useState(false);
  const tenantId = snapshot.business.tenantId;
  const definition = snapshot.capabilities.find((item) => item.id === record.capabilityId)?.live;
  if (!tenantId || snapshot.rehearsal || !can("canEdit") || record.status === "handled" || !definition) return null;
  return <section aria-label="Messages for this inquiry">
    <label className={styles.ruleHint}>Message to review <select value={action} onChange={(event) => { setAction(event.target.value as InquiryMessageReviewAction); setCompleted(false); }}>
      <option value="reply">Confirm we received the inquiry</option>
      {definition.routing ? <option value="owner_notification">Notify the assigned team</option> : null}
      {definition.followUp ? <option value="schedule_follow_up">Follow up with the customer</option> : null}
    </select></label>
    <InquiryMessageReview key={`${tenantId}:${record.id}:${action}`} tenantId={tenantId} inquiryId={record.id} action={action} autoPrepare={false} onCompleted={() => setCompleted(true)} />
    {completed ? <button type="button" className={styles.secondaryButton} onClick={() => window.location.reload()}>Refresh record and receipts</button> : null}
  </section>;
}
