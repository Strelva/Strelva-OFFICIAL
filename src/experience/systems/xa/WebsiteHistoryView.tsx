"use client";
/**
 * XA · S6 · History of one website. Every past state, newest first, with
 * whoever made it; choose one to see what changed and go back to it.
 *
 * Words follow GLOSSARY.md: past states are History (the board's draft says
 * "versions"; Version means an adaptation for another business). Going back
 * prepares the earlier state for review through the same restore route as
 * before; nothing goes live from this screen.
 */
import { useRef, useState } from "react";
import { XaAnswers, XaButton, XaButtonLink, XaEmpty, XaHeadline, XaInitial, XaPebbleAvatar, XaStatus } from "@/components/ui/strelva/Xa";
import { actorPresentation, recordedActor } from "@/platform/presentation/actor";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import type { SystemHistoryRow } from "../model";
import { mergeWebsiteHistory, type WebsiteHistoryItem } from "../website-detail";
import { restoreWebsiteHistory, type WebsiteDetailState } from "../WebsiteSystemPanels";
import styles from "./system-xa.module.css";

const SOURCE: Record<WebsiteHistoryItem["source"], string> = {
  content: "Words and photos", snapshot: "A saved copy of the site", document: "A site revision", deploy: "A change to the site's code", system: "A release",
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
  return name ? <XaInitial name={name} size={32} shape={actor?.kind === "person" ? "round" : "square"} color={actor?.kind === "agency" ? "#2f5236" : undefined} /> : <XaInitial name="·" size={32} />;
}

/** Deploy receipts carry their check in the title; the check is said in the panel instead. */
function titleOf(item: WebsiteHistoryItem): string {
  return item.deployment ? item.title.replace(/ · (live and checked|deployed, not yet confirmed)$/, "") : item.title;
}

function byLine(item: WebsiteHistoryItem): string {
  const { name } = actorPresentation(item.actor);
  const when = day(item.at, true);
  return name ? `${name} · ${when}` : when;
}

export function WebsiteHistoryView({ workspaceId, systemId, siteName, state, systemHistory = [], canRestore, appBase = "", onBack, onPrepared, onAskRestore }: {
  workspaceId: string; systemId: string; siteName: string; state: WebsiteDetailState | null; systemHistory?: SystemHistoryRow[]; canRestore: boolean;
  appBase?: string; onBack: () => void; onPrepared?: () => void; onAskRestore?: () => void;
}) {
  const request = useWorkspaceRequest();
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const [notices, setNotices] = useState<Record<string, { error: boolean; text: string }>>({});
  const back = <button type="button" className={styles.back} onClick={onBack}>‹ {siteName}</button>;
  if (!state || state.status === "loading") return <div className={styles.screen} aria-busy="true">{back}<XaEmpty size="sm" pose="website" title="Opening this site's History" job="Pebble is reading every saved change" /></div>;
  if (state.status === "error") return <div className={styles.screen}>{back}<XaEmpty size="sm" pose="fixing" title="History could not be read just now" job="Nothing about the site changed. Pebble will read it again when you reload.">{state.message}</XaEmpty></div>;
  const history = mergeWebsiteHistory(state.detail.history, systemHistory);
  const missing = state.detail.unavailable.filter(name => ["Content history", "Saved copies", "Site revisions", "Site replacements", "Repo deploy history", "System release history"].includes(name));
  if (!history.length) return <div className={styles.screen}>{back}<XaEmpty size="sm" pose="website" title="No changes are recorded yet" job="Pebble keeps every change from here on, with who made it">{missing.length ? `Couldn't read ${missing.join(", ").toLowerCase()} just now.` : "The site is as it was when it came to Strelva."}</XaEmpty></div>;
  const selected = history.find(item => item.id === chosen) ?? history[0]!;
  const index = history.indexOf(selected);
  const oldest = history[history.length - 1]!;
  const notice = notices[selected.id];

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
        : selected.source === "deploy" && selected.undo && onAskRestore ? <XaButton block size="lg" onClick={onAskRestore}>Ask Strelva to go back to this</XaButton> : null;

  return <div className={styles.history}>
    <div className={styles.historyList}>
      {back}
      <XaHeadline size="md" quiet={`The newest is first. ${canRestore ? "Go back to any of them." : "Only the owner or an admin can go back."}`}>{history.length} {history.length === 1 ? "change" : "changes"} since {day(oldest.at)}.</XaHeadline>
      <ol className={styles.changes} aria-label={`History of ${siteName}`}>
        {history.map((item, position) => <li key={item.id}>
          <button type="button" className={styles.change} aria-current={item.id === selected.id || undefined} onClick={() => { setChosen(item.id); if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1100px)").matches) sheet.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>
            <span className={styles.changeIndex} aria-hidden="true">{history.length - position}</span>
            <By item={item} />
            <span className={styles.changeText}><span className={styles.changeTitle}>{titleOf(item)}</span><span className={styles.changeBy}>{byLine(item)}</span></span>
            <span className={styles.changeMeta}>{position === 0 && item.deployment?.readBack === "confirmed" ? <XaStatus kind="live" size="sm">Live</XaStatus> : item.id === selected.id ? "Viewing" : null}</span>
          </button>
        </li>)}
      </ol>
      {missing.length ? <p className={styles.quiet} role="status">Couldn&apos;t read {missing.join(", ").toLowerCase()} just now. Nothing about them is shown.</p> : null}
    </div>
    <section ref={sheet} className={styles.sheet} aria-label={`Change ${history.length - index}: ${titleOf(selected)}`}>
      <div className={styles.sheetHead}><h2 className={styles.sheetTitle}>{titleOf(selected)}</h2><span className={styles.quiet}>{byLine(selected)}</span></div>
      <XaAnswers labelWidth={110} rows={[
        ["What changed", SOURCE[selected.source]],
        ...(selected.deployment ? [["Checked", selected.deployment.readBack === "confirmed" ? "The live page was read back and matches." : selected.deployment.readBack === "not_confirmed" ? "Published. The live page did not match when read back." : "Published. The live page was not read back."] as const] : []),
        ["Going back", selected.undo ?? "No way back is recorded for this change."],
      ]} />
      {notice ? <p className={styles.sentence} data-tone={notice.error ? "waits" : undefined} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
      {action}
      {action ? <p className={styles.quiet}>Going back prepares the earlier state for your review. Your live site is unchanged until then, and nothing is lost.</p> : index === 0 ? <p className={styles.quiet}>This is the newest change.</p> : null}
    </section>
  </div>;
}
