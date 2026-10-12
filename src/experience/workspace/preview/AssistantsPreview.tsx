"use client";
import { useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StEmpty, StHead, StLabel, StMono, StNotice, StPage, StRow, StRows, StSection, StSkeleton } from "@/components/ui/strelva/Kit";
import type { AssistantViewState } from "@/experience/product/assistants/PublicBusinessProfile";
import { assistantsBusiness, assistantsPermissions, assistantsReceipts } from "./assistants-fixture";
import styles from "@/experience/product/assistants/assistants.module.css";

export function AssistantsPreview({ state }: { state: AssistantViewState }) {
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  return <StrelvaShell active="system" title="" accountName="Fictional owner" workspaceName={assistantsBusiness} systemsReleased pinned={[
    { id: "website", title: "fictional-mediation.example.test", href: "/preview/strelva/business-profile", kind: "website" },
    { id: "inquiries", title: "Inquiries", href: "/preview/strelva/assistants", kind: "inquiries" },
    { id: "assistants", title: "Assistants", href: "/preview/strelva/assistants", kind: "app", current: true },
  ]}>
    <StPage><StHead crumb={{ label: "Systems", href: "/preview/strelva/assistants" }} title="Assistants" beacon={state === "ready" ? "live" : "draft"} meta="Gemini, ChatGPT and others can act for people who ask them about you · business confirmed Oct 3" />
      {state === "loading" ? <div className={styles.stack}><StSkeleton label="Loading assistant permissions" /><StSkeleton /><StSkeleton width="70%" /></div> : state === "error" || state === "permission" ? <StNotice tone="critical">{state === "permission" ? "Only a business owner can review assistant permissions and receipts." : "Assistant permissions and receipts could not be loaded. Try opening this page again."}</StNotice> : <div className={styles.ownerColumns}>
        <StSection title="Allowed">{state === "empty" ? <StEmpty>No assistant permissions have been published for this business.</StEmpty> : <StRows label="Assistant permissions">{assistantsPermissions.map(permission => <StRow key={permission.label} lead={<span className={styles.permissionMark} data-enabled={permission.enabled} aria-hidden="true" />} title={permission.label} detail={permission.detail} end={<StMono>{permission.authority}</StMono>} />)}</StRows>}</StSection>
        <section className={styles.stack} aria-label="Assistant receipts"><StLabel>Receipts</StLabel>{state === "empty" ? <StEmpty>No assistant requests have been recorded.</StEmpty> : <div className={styles.stack}>{assistantsReceipts.map(receipt => <div key={receipt.text} className={styles.receipt}><span aria-hidden="true">{receipt.mark}</span><span className={styles.receiptText}>{receipt.text}</span><StMono>{receipt.time}</StMono></div>)}</div>}</section>
      </div>}
      <p className={styles.muted}>Strelva sees which assistant called only when it says so. Receipts show what was asked and answered, never more.</p>
      <p className={styles.fixture}>Fictional permissions and receipts. The permission marks are a read-only preview; no business access changes here.</p>
      {notice ? <StNotice>{notice}</StNotice> : null}
    </StPage>
    <StComposerDock><StComposerBar scope="Assistants" placeholder="Ask about assistants" value={question} onChange={setQuestion} onSubmit={() => { setNotice("This preview shows fictional assistant permissions. Open connected assistants to review real business access."); setQuestion(""); }} disabled={state !== "ready"} /></StComposerDock>
  </StrelvaShell>;
}
