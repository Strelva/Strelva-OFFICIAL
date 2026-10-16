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
 * see it. On a phone the two take turns.
 */
export function WebsiteSystemCanvas({ system, comparing, mode, onModeChange, sandbox }: {
  system: SystemView & { surface: Extract<SystemView["surface"], { kind: "website" }> };
  comparing?: SystemPossibility;
  mode: WebsiteCanvasMode;
  onModeChange: (mode: WebsiteCanvasMode) => void;
  sandbox: (src: string) => string;
}) {
  const { surface } = system;
  const address = surface.domain || host(surface.liveUrl ?? surface.previewSrc, system.name);
  const live = <XaPage bleed address={address} label={`${system.name} as visitors see it`}>
    {surface.previewSrc ? <iframe className={styles.frame} title={`${system.name} as visitors see it`} src={surface.previewSrc} sandbox={sandbox(surface.previewSrc)} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
      : <p className={styles.frameEmpty}>No address is recorded for this website yet, so there is nothing to show. Website controls still open it.</p>}
  </XaPage>;
  if (!comparing || mode === "current") return live;
  const show = mode === "possibility" ? "proposed" : mode === "both" ? undefined : "live";
  return <div className={styles.main}>
    <div className={styles.phoneOnly}><XaSegmented label="What to show" block value={mode === "possibility" ? "possibility" : "both"} options={[{ value: "both", label: "Live now" }, { value: "possibility", label: "Proposed" }]} onChange={value => onModeChange(value)} /></div>
    <div className={styles.compare} data-show={show ?? "live"}>
      <div className={styles.compareCol}><XaStatus kind="live" size="sm">Live now</XaStatus>{live}</div>
      <div className={styles.compareCol}><XaStatus kind="draft" size="sm">Proposed</XaStatus>
        <XaPage bleed address={address} label={`${comparing.title}, not live`}>
          <iframe className={styles.frame} title={`${comparing.title}, not live`} src={comparing.previewSrc} sandbox="" loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
        </XaPage>
      </div>
    </div>
  </div>;
}
