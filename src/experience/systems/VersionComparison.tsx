"use client";

import type { CSSProperties } from "react";
import { StEmpty, StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./version-comparison.module.css";

export interface ComparedVersion {
  id: string;
  name: string;
  release: string;
  state: "live" | "draft" | "need" | "down";
  stateLabel: string;
}
export interface VersionDifference {
  id: string;
  label: string;
  source: string;
  values: readonly { versionId: string; value: string; locallyChanged?: boolean }[];
}
export interface VersionImprovementOffer {
  title: string;
  versions: readonly { versionId: string; sentence: string; conflicting: boolean }[];
  explanation: string;
}

/** Context Versions are separate Systems with separate review decisions.
 * This comparison reads supplied values; it never broadcasts an improvement. */
export function VersionComparison({ title, meta, versions, differences, offer, state = "ready", onReview, onNotNow, onRetry, systemsHref = "/workspace?view=apps" }: {
  title: string;
  meta: string;
  systemsHref?: string;
  versions: readonly ComparedVersion[];
  differences: readonly VersionDifference[];
  offer?: VersionImprovementOffer;
  state?: "ready" | "loading" | "error" | "empty" | "permission";
  onReview?: () => void;
  onNotNow?: () => void;
  onRetry?: () => void;
}) {
  return <StPage width={versions.length > 2 ? "wide" : "column"}>
    <StHead title={title} meta={meta} crumb={{ label: "Systems", href: systemsHref }} />
    {state === "loading" ? <div className={styles.stack}><p role="status">Reading these Versions…</p><StSkeleton label="Reading these Versions" /><StSkeleton width="70%" /></div>
      : state === "error" ? <StNotice tone="critical">The Versions could not be read. Nothing changed.{onRetry ? <StTextButton onClick={onRetry}>Try again</StTextButton> : null}</StNotice>
        : state === "permission" ? <StNotice>Your account cannot compare these Versions. Ask the business owner for access.</StNotice>
          : state === "empty" || !versions.length ? <StEmpty>This System has no location or client Versions to compare.</StEmpty>
            : <>
              <div className={styles.comparison} aria-label="Differences between Versions" style={{ "--version-columns": versions.length } as CSSProperties}>
                <div className={styles.heading}><span className="sr-only">What differs</span><div className={styles.values}>{versions.map(version => <div key={version.id} className={styles.versionHead}><StState kind={version.state}>{version.name} · {version.stateLabel}</StState><StMono>{version.release}</StMono></div>)}</div></div>
                <StRows>{differences.map(difference => <StRow key={difference.id} title={difference.label} detail={difference.source} end={<div className={styles.values}>{versions.map(version => {
                  const value = difference.values.find(item => item.versionId === version.id);
                  return <div key={version.id} className={styles.value} data-local={value?.locallyChanged || undefined}><span className={styles.phoneLabel}>{version.name}</span><span>{value?.value ?? "Not recorded"}</span>{value?.locallyChanged ? <span className="sr-only"> · Local change kept</span> : null}</div>;
                })}</div>} />)}</StRows>
              </div>
              {offer ? <StSurface tone="need" label="Offered improvement"><div className={styles.stack}>
                <StState kind="need">{offer.title}</StState>
                <div className={styles.offerVersions}>{offer.versions.map(version => <div key={version.versionId}><StState kind={version.conflicting ? "need" : "live"}>{version.sentence}</StState></div>)}</div>
                <div className={styles.offerFooter}><span>{offer.explanation}</span><div className={styles.actions}>{onNotNow ? <StTextButton onClick={onNotNow}>Not now</StTextButton> : null}{onReview ? <StPill onClick={onReview}>Review improvement</StPill> : null}</div></div>
              </div></StSurface> : null}
            </>}
  </StPage>;
}
