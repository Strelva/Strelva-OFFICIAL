"use client";

import { ArrowDown, ArrowUp, AlertCircle } from "lucide-react";
import { StEmpty, StHead, StMono, StNotice, StPage, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { CONNECTION_KIND_LABEL, INCOMING_CONNECTION_LABEL, type SystemConnection } from "./model";
import styles from "./connection-detail.module.css";

export interface ConnectionReadWrite {
  id: string;
  kind: "read" | "write" | "notice";
  sentence: string;
  at: string;
  dateTime?: string;
}

/** Values come from the Connection's recorded contract. Missing evidence is
 * displayed as unknown; a connected mark alone supplies no write authority. */
export interface ConnectionDetailData {
  name: string;
  systemName: string;
  systemHref?: string;
  status: SystemConnection["status"];
  direction: string;
  authority?: string;
  source?: string;
  freshness?: string;
  failureBehavior?: string;
  recent?: readonly ConnectionReadWrite[];
}

export function connectionDetailData(connection: SystemConnection, systemName: string, systemHref?: string): ConnectionDetailData {
  return {
    name: connection.target,
    systemName,
    systemHref,
    status: connection.status,
    direction: `${systemName} ${(connection.direction === "in" ? INCOMING_CONNECTION_LABEL[connection.kind] : CONNECTION_KIND_LABEL[connection.kind]).toLowerCase()} ${connection.target}. ${connection.sentence}`,
    authority: connection.contract?.authority,
    source: connection.contract?.sourceOfTruth,
    freshness: connection.contract?.freshness,
    failureBehavior: connection.contract?.failureBehavior,
  };
}

export type ConnectionDetailState = "ready" | "loading" | "error" | "empty" | "permission";

export function ConnectionDetail({ detail, state = "ready", onRetry, onDisconnect, onAllowAgain, embedded = false }: {
  detail: ConnectionDetailData;
  state?: ConnectionDetailState;
  onRetry?: () => void;
  onDisconnect?: () => void;
  onAllowAgain?: () => void;
  embedded?: boolean;
}) {
  const content = <>
    {!embedded ? <StHead crumb={{ label: detail.systemName, href: detail.systemHref }} title={detail.name}
      beacon={detail.status === "connected" ? "live" : detail.status === "not_connected" ? "down" : "draft"}
      meta={`A Connection · used by ${detail.systemName} · ${detail.status === "connected" ? "Connected" : detail.status === "not_connected" ? "Not connected" : "Connection not verified"}`} /> : null}
    {state === "loading" ? <div className={styles.stack}><p role="status">Reading this Connection…</p><StSkeleton label="Reading this Connection" /><StSkeleton width="75%" /><StSkeleton width="60%" /></div>
      : state === "error" ? <StNotice tone="critical">This Connection could not be read. Its permissions and latest activity are unavailable.{onRetry ? <StTextButton onClick={onRetry}>Try again</StTextButton> : null}</StNotice>
        : state === "permission" ? <StNotice>Your account cannot open this Connection. Ask the business owner for access.</StNotice>
          : state === "empty" ? <StEmpty>No recorded Connection details are available.</StEmpty>
            : <div className={styles.columns}>
              <div className={styles.stack}>
                <StRows label="Connection contract">
                  {[
                    ["Direction", detail.direction],
                    ["Allowed by", detail.authority ?? "Who allowed this Connection is not recorded."],
                    ["Source", detail.source ?? "The source of truth is not recorded."],
                    ["Freshness", detail.freshness ?? "No freshness evidence is available."],
                    ["If it stops", detail.failureBehavior ?? "What happens if this Connection stops is not recorded."],
                  ].map(([label, value]) => <StRow key={label} lead={<span className={styles.contractLabel}>{label}</span>} title={null} detail={value} stackOnPhone={false} />)}
                </StRows>
                {onDisconnect || onAllowAgain ? <div className={styles.actions}>
                  {onDisconnect ? <StTextButton onClick={onDisconnect}>Disconnect</StTextButton> : null}
                  {onAllowAgain ? <StTextButton onClick={onAllowAgain}>Allow again with a different account</StTextButton> : null}
                </div> : null}
              </div>
              <StSection title="Recent">
                {detail.recent?.length ? <StRows label="Recent reads and writes">{detail.recent.map(item => <StRow key={item.id}
                  lead={item.kind === "read" ? <ArrowDown size={14} aria-hidden="true" /> : item.kind === "write" ? <ArrowUp size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
                  title={null} detail={item.sentence}
                  end={<StMono as={item.dateTime ? "time" : "span"} dateTime={item.dateTime}>{item.at}</StMono>} />)}</StRows>
                  : <StEmpty>No recent reads or writes are recorded here.</StEmpty>}
              </StSection>
            </div>}
  </>;
  return embedded ? <div className={styles.stack}>{content}</div> : <StPage>{content}</StPage>;
}
