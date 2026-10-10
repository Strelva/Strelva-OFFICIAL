"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicFrame } from "@/experience/product/PublicFrame";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { AiVisibilityResultView } from "@/products/ai-visibility/AiVisibilityResultView";
import { StCopy, StEmpty, StTextField, StHead, StLabel, StMono, StNotice, StPage, StPill, StPillLink, StSteps, StSurface } from "@/components/ui/strelva/Kit";
import { answerCheckFixture, answerSampleFixture } from "./answer-check-fixture";
import styles from "@/products/ai-visibility/answer-check.module.css";

export function AnswerCheckPreview({ state }: { state: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  return <PublicFrame preview><StNotice>Fictional preview · no Gemini call, sign-up, website change or email.</StNotice>
    {state === "entry" ? <div onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); router.push("/preview/strelva/answer-check?state=result"); }}><AiVisibilityPage /></div> : state === "continue" ? <StPage className={styles.continuation}><StNotice><StLabel>From your check</StLabel><StMono>attymooney.com · 2 wrong answers · hours unreadable</StMono></StNotice><StHead title="Fix it, then keep it fixed" meta="Carry your check into a private workspace. Nothing on your site changes until you approve it." /><form className={styles.stack} onSubmit={event => { event.preventDefault(); setSaved(true); }}><StTextField label="Your email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /><StPill type="submit" block>Start with this fix</StPill></form>{saved ? <StSurface label="Fictional workspace"><StLabel>Your check is carried into this preview workspace</StLabel><StCopy>{answerCheckFixture.topFix}</StCopy><StCopy muted>No real account was created. This result remains fictional.</StCopy></StSurface> : <StCopy muted>Someone else runs your site? You can invite them after.</StCopy>}</StPage> : <StPage width="wide">
      {state === "loading" ? <><StHead title="Checking your business" /><StSteps label="Business check" steps={[{ title: "Reading the public website", state: "active" }, { title: "Checking one Gemini answer", state: "pending" }]} /></> : state === "error" || state === "permission" ? <><StHead title={state === "permission" ? "This check is unavailable to your account" : "The check couldn’t be completed"} /><StNotice tone="critical">{state === "permission" ? "Open a check you have access to, or sign in with the account that saved it." : "No answer was measured. Your website is unchanged."}</StNotice><StPillLink variant="soft" href="/preview/strelva/answer-check?state=entry">Try another check</StPillLink></> : state === "empty" ? <><StHead title="No saved check yet" /><StEmpty action={<StPillLink href="/preview/strelva/answer-check?state=entry">Check your business</StPillLink>}>Start with your business name and website.</StEmpty></> : state === "unavailable" ? <AiVisibilityResultView result={{ ...answerCheckFixture, measurementStatus: "unavailable", readinessMeasured: false, signals: [], verdict: "This run could not be measured.", topFix: "Try again with a reachable public website.", citation: { probed: false, mentioned: false, recommended: false, note: "Gemini could not be checked." } }} scanId={null} shareUrl={null} continuationHref="/preview/strelva/answer-check?state=entry" onReset={() => router.push("/preview/strelva/answer-check?state=entry")} /> : <AiVisibilityResultView result={answerCheckFixture} scanId={null} shareUrl={null} sample={answerSampleFixture} continuationHref="/preview/strelva/answer-check?state=continue" onReset={() => router.push("/preview/strelva/answer-check?state=entry")} />}

    </StPage>}
  </PublicFrame>;
}
