"use client";

import { StEmpty, StLabel, StSegmented, StSurface } from "@/components/ui/strelva/Kit";
import { LIFECYCLE_LABEL, POSSIBILITY_STATUS_LABEL, type SystemPossibility, type SystemView } from "./model";
import styles from "./website-system-canvas.module.css";

export type WebsiteCanvasMode = "current" | "possibility" | "both";

/** The actual website remains the object being viewed, including during comparison. */
export function WebsiteSystemCanvas({ system, comparing, mode, onModeChange, sandbox }: {
  system: SystemView & { surface: Extract<SystemView["surface"], { kind: "website" }> };
  comparing?: SystemPossibility;
  mode: WebsiteCanvasMode;
  onModeChange: (mode: WebsiteCanvasMode) => void;
  sandbox: (src: string) => string;
}) {
  const { surface } = system;
  return <div className={styles.canvas}>
    <div className={styles.canvasHead}>
      <StLabel as="span">{comparing && mode !== "current" ? `Comparing with: ${comparing.title}` : system.lifecycle === "live" ? "Live now" : LIFECYCLE_LABEL[system.lifecycle]}</StLabel>
      {comparing ? <StSegmented label="What to show" value={mode} options={[
        { value: "current", label: "Current" }, { value: "possibility", label: "Possibility" }, { value: "both", label: "Side by side" },
      ]} onChange={onModeChange} /> : null}
    </div>
    <StSurface pad={false}>
      <div className={styles.frames}>
        {mode !== "possibility" || !comparing ? <figure>
          {comparing && mode === "both" ? <figcaption>Current · {surface.domain || system.name}</figcaption> : null}
          {surface.previewSrc ? <iframe title={`${system.name} as visitors see it`} src={surface.previewSrc} sandbox={sandbox(surface.previewSrc)} loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
            : <StEmpty>No address is recorded for this website yet, so there is nothing to show. Website controls still open it.</StEmpty>}
        </figure> : null}
        {comparing && mode !== "current" ? <figure>
          {mode === "both" ? <figcaption>{POSSIBILITY_STATUS_LABEL[comparing.status]} · {comparing.title}</figcaption> : null}
          <iframe title={`${comparing.title}, not live`} src={comparing.previewSrc} sandbox="" loading="lazy" referrerPolicy="no-referrer" tabIndex={-1} />
        </figure> : null}
      </div>
    </StSurface>
  </div>;
}
