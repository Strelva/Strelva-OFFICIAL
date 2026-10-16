"use client";
/**
 * XA · S6 · History of one website. Every past state, newest first, with
 * whoever made it; choose one to see what changed and go back to it.
 *
 * Words follow GLOSSARY.md: past states are History (the board's draft says
 * "versions"; Version means an adaptation for another business). Going back
 * prepares the earlier state for review through the same restore route as
 * before; nothing goes live from this screen.
 *
 * The sheet is built around the change's own reason. The newest change shows
 * the live page itself; an older one shows its reason inside the page frame,
 * because no picture of the page at that time is stored (said, not faked).
 */
import { useRef, useState } from "react";
import { XaAnswers, XaButton, XaButtonLink, XaEmpty, XaHeadline, XaInitial, XaPage, XaPebbleAvatar, XaSays, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { actorPresentation, recordedActor } from "@/platform/presentation/actor";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import type { SystemHistoryRow } from "../model";
import { mergeWebsiteHistory, type WebsiteHistoryItem } from "../website-detail";
import { restoreWebsiteHistory, type WebsiteDetailState } from "../WebsiteSystemPanels";
import styles from "./system-xa.module.css";

/** What going back does, in owner words, by where the change is kept. */
const GOING_BACK: Record<WebsiteHistoryItem["source"], string> = {
  content: "Puts these words back as a draft for your review. Nothing goes live until you say yes.",
  snapshot: "Strelva prepares this saved copy of the site for your review. Nothing goes live until you say yes.",
  document: "Saves this earlier site as a new draft for your review. Nothing goes live until you say yes.",
  deploy: "Your agency prepares the site as it was for your review. Nothing goes live until you say yes.",
  system: "Going back to this isn't recorded as possible.",
};

const CHECKED: Record<NonNullable<WebsiteHistoryItem["deployment"]>["readBack"], string> = {
  confirmed: "Pebble read the live page back. It matches.",
  not_confirmed: "Pebble read the live page back. It didn't match yet.",
  not_checked: "The live page hasn't been read back yet.",
};

function day(at: string, withTime = false): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });
}

function By({ item }: { item: WebsiteHistoryItem }) {
  const actor = recordedActor(item.actor);
  if (actor?.kind === "platform") return <XaPebbleAvatar size={32} />;
  const { name } = actorPresentation(item.actor);
  return name ? <XaInitial name={actor?.kind === "agency" ? name.split(" at ").pop() || name : name} size={32} shape={actor?.kind === "person" ? "round" : "square"} color={actor?.kind === "agency" ? "#2f5236" : undefined} /> : <XaInitial name="·" size={32} />;
}

/** Deploy receipts carry their check in the title; the check is said in the sheet instead. */
function titleOf(item: WebsiteHistoryItem): string {
  return item.deployment ? item.title.replace(/ · (live and checked|deployed, not yet confirmed)$/, "") : item.title;
}

function byLine(item: WebsiteHistoryItem): string {
  const { name } = actorPresentation(item.actor);
  const when = day(item.at, true);
  return name ? `${name} · ${when}` : when;
}

/** The newest change is what visitors see, unless its read-back says otherwise. */
function isLive(item: WebsiteHistoryItem, position: number): boolean {
  return position === 0 && item.source !== "snapshot" && (!item.deployment || item.deployment.readBack === "confirmed");
}

export function WebsiteHistoryView({ workspaceId, systemId, siteName, state, systemHistory = [], canRestore, appBase = "", address, livePreviewSrc, sandbox = () => "", onBack, onPrepared, onReload, onAskRestore }: {
  workspaceId: string; systemId: string; siteName: string; state: WebsiteDetailState | null; systemHistory?: SystemHistoryRow[]; canRestore: boolean;
  appBase?: string;
  /** The site's address for the page frame; defaults to its name. */
  address?: string;
  /** The live page, shown in the sheet for the change that is live now. */
  livePreviewSrc?: string;
  sandbox?: (src: string) => string;
  onBack: () => void; onPrepared?: () => void; onReload?: () => void; onAskRestore?: () => void;
}) {
  const request = useWorkspaceRequest();
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const [notices, setNotices] = useState<Record<string, { error: boolean; text: string }>>({});
  const back = <button type="button" className={styles.back} onClick={onBack}>‹ {siteName}</button>;
  if (!state || state.status === "loading") return <div className={styles.screen} aria-busy="true">{back}<XaEmpty size="sm" bare pose="website" title="Opening this site's History" job="Pebble is reading every saved change" /></div>;
  if (state.status === "error") return <div className={styles.screen}>{back}<XaEmpty size="sm" bare pose="fixing" title="History couldn't be read just now"
    job="Nothing about the site changed. Pebble kept every saved change."
    action={onReload ? <XaTextLink onClick={onReload}>Reload</XaTextLink> : undefined}>{/^history could/i.test(state.message) ? null : state.message}</XaEmpty></div>;
  const history = mergeWebsiteHistory(state.detail.history, systemHistory);
  const missing = state.detail.unavailable.filter(name => ["Content history", "Saved copies", "Site revisions", "Site replacements", "Repo deploy history", "System release history"].includes(name));
  if (!history.length) return <div className={styles.screen}>{back}<XaEmpty size="sm" bare pose="website" title="No changes are recorded yet" job="Pebble keeps every change from here on, with who made it">{missing.length ? `Couldn't read ${missing.join(", ").toLowerCase()} just now.` : "The site is as it was when it came to Strelva."}</XaEmpty></div>;
  const selected = history.find(item => item.id === chosen) ?? history[0]!;
  const index = history.indexOf(selected);
  const oldest = history[history.length - 1]!;
  const notice = notices[selected.id];
  const liveNow = isLive(history[0]!, 0);
  const number = (position: number) => history.length - position;

  async function goBack() {
    if (busy) return;
    setBusy(true);
    const result = await restoreWebsiteHistory(request, workspaceId, systemId, selected);
    setNotices(current => ({ ...current, [selected.id]: result }));
    if (!result.error) onPrepared?.();
    setBusy(false);
  }

  const action = !canRestore || index === 0 ? null
    : selected.restore ? <XaButton block size="lg" busy={busy} disabled={Boolean(notice && !notice.error)} onClick={() => void goBack()}>{"kind" in selected.restore && selected.restore.kind === "snapshot" ? "Ask Strelva to go back to this" : "Go back to this"}</XaButton>
      : selected.restoreHref ? <XaButtonLink block size="lg" href={`${appBase}${selected.restoreHref}`}>Go back to this in History</XaButtonLink>
        : selected.source === "deploy" && selected.undo && onAskRestore ? <XaButton block size="lg" onClick={onAskRestore}>Ask for this to come back</XaButton> : null;
  const goingBack = index === 0 ? null : selected.undo ? GOING_BACK[selected.source] : "There is no way back recorded for this change.";
  const showLive = index === 0 && liveNow && livePreviewSrc;

  return <div className={styles.history}>
    <div className={styles.historyList}>
      {back}
      <XaHeadline size="md" quiet={`${liveNow ? `Release ${history.length} is live. ` : ""}${canRestore ? "Go back to any of them." : "Only the owner or an admin can go back."}`}>{history.length} {history.length === 1 ? "release" : "releases"} since {day(oldest.at)}.</XaHeadline>
      <ol className={styles.changes} aria-label={`History of ${siteName}`}>
        {history.map((item, position) => <li key={item.id}>
          <button type="button" className={styles.change} aria-current={item.id === selected.id || undefined} onClick={() => { setChosen(item.id); if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1100px)").matches) sheet.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>
            <span className={styles.changeIndex} aria-hidden="true">{number(position)}</span>
            <By item={item} />
            <span className={styles.changeText}><span className={styles.changeTitle}>{titleOf(item)}</span><span className={styles.changeBy}>{byLine(item)}</span></span>
            <span className={styles.changeMeta}>{isLive(item, position) ? <XaStatus kind="live" size="sm">Live</XaStatus> : item.id === selected.id ? "Viewing" : null}</span>
          </button>
        </li>)}
      </ol>
      {missing.length ? <p className={styles.quiet} role="status">Couldn&apos;t read {missing.join(", ").toLowerCase()} just now. Nothing about them is shown.</p> : null}
    </div>
    <section ref={sheet} className={styles.sheet} aria-label={`Release ${number(index)}: ${titleOf(selected)}`}>
      <div className={styles.sheetHead}><h2 className={styles.sheetTitle}>Release {number(index)}</h2><span className={styles.quiet}>{byLine(selected)}</span></div>
      {showLive ? <XaPage bleed flat address={address || siteName} label={`${siteName} as visitors see it now`}>
        <iframe className={styles.sheetFrame} title={`${siteName} as visitors see it now`} src={livePreviewSrc} sandbox={sandbox(livePreviewSrc)} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
      </XaPage> : <XaSays>{index === 0
        ? `${titleOf(selected)}. This is the newest change, and Strelva didn't keep a picture of the page from it.`
        : `Strelva didn't keep a picture of ${siteName} from ${day(selected.at)}, so its change is named here instead: ${titleOf(selected).replace(/[.?!]+$/, "")}.`}</XaSays>}
      <XaAnswers labelWidth={110} rows={[
        ...(showLive ? [["Changed", titleOf(selected)] as const] : []),
        ...(selected.deployment ? [["Checked", CHECKED[selected.deployment.readBack]] as const] : []),
        ...(goingBack ? [["Going back", goingBack] as const] : []),
      ]} />
      {notice ? <p className={styles.sentence} data-tone={notice.error ? "waits" : undefined} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
      {action}
    </section>
  </div>;
}
