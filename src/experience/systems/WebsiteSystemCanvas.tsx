"use client";

import { XaPage, XaSegmented, XaStatus } from "@/components/ui/strelva/Xa";
import { type SystemPossibility, type SystemView } from "./model";
import styles from "./xa/system-xa.module.css";

export type WebsiteCanvasMode = "current" | "possibility" | "both";

function host(src: string | undefined, fallback: string): string {
  if (!src) return fallback;
  try { return new URL(src).host.replace(/^www\./, "") || fallback; } catch { return fallback; }
}

/**
 * The actual website stays the object being viewed (XA · S1), including
 * during comparison (XA · S5): Live now beside Proposed, each as visitors
 * see it. On a phone the two take turns. Once a Possibility has landed
 * (`landed`), there is nothing left to compare: the live site is read again
 * and shown alone, as visitors now see it.
 */
export function WebsiteSystemCanvas({ system, comparing, mode, onModeChange, sandbox, landed = false }: {
  system: SystemView & { surface: Extract<SystemView["surface"], { kind: "website" }> };
  comparing?: SystemPossibility;
  mode: WebsiteCanvasMode;
  onModeChange: (mode: WebsiteCanvasMode) => void;
  sandbox: (src: string) => string;
  /** The Possibility is live: show the live site, loaded again, and no Proposed beside it. */
  landed?: boolean;
}) {
  const { surface } = system;
  const address = surface.domain || host(surface.liveUrl ?? surface.previewSrc, system.name);
  const live = <XaPage bleed address={address} label={`${system.name} as visitors see it${landed ? " now" : ""}`}>
    {/* A new key loads the live page again once the change landed, so it shows what visitors see now. */}
    {surface.previewSrc ? <iframe key={landed ? "landed" : "live"} className={styles.frame} title={`${system.name} as visitors see it${landed ? " now" : ""}`} src={surface.previewSrc} sandbox={sandbox(surface.previewSrc)} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
      : <p className={styles.frameEmpty}>No address is recorded for this website yet, so there is nothing to show. Website controls still open it.</p>}
  </XaPage>;
  if (!comparing || mode === "current" || landed) return live;
  const show = mode === "possibility" ? "proposed" : mode === "both" ? undefined : "live";
  return <div className={styles.main}>
    <div className={styles.phoneOnly}><XaSegmented label="What to show" block value={mode === "possibility" ? "possibility" : "both"} options={[{ value: "both", label: "Live now" }, { value: "possibility", label: "Proposed" }]} onChange={value => onModeChange(value)} /></div>
    <div className={styles.compare} data-show={show ?? "live"}>
      {/* On a phone the segment above names each side, so the column labels step aside. */}
      <div className={styles.compareCol}><span className={styles.colLabel}><XaStatus kind="live" size="sm">Live now</XaStatus></span>{live}</div>
      <div className={styles.compareCol}><span className={styles.colLabel}><XaStatus kind="draft" size="sm">Proposed</XaStatus></span>
        <XaPage bleed address={address} label={`${comparing.title}, not live`}>
          <iframe className={styles.frame} title={`${comparing.title}, not live`} src={comparing.previewSrc} sandbox="" loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
        </XaPage>
      </div>
    </div>
  </div>;
}
