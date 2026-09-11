"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceApp } from "../WorkspaceApp";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import { createPreviewRequest, PREVIEW_SCENARIOS, type PreviewScenario } from "./fixture";
import styles from "./preview.module.css";

export function WorkspacePreview({ scenario }: { scenario: PreviewScenario }) {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const preview = previewRef.current;
    if (!controls || !preview) return;
    const measure = () => preview.style.setProperty("--app-frame-height", `calc(100dvh - ${controls.getBoundingClientRect().height}px)`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, []);
  const request = useMemo(() => createPreviewRequest(scenario), [scenario]);
  const inquiry = useMemo(() => ({ tenantId: "buffalo-realty", label: "Buffalo Realty", adapter: createPreviewInquiryAdapter("business", scenario) }), [scenario]);
  return <div ref={previewRef} data-dashboard className={styles.preview}>
    <aside ref={controlsRef} className={styles.controls} aria-label="Local preview controls">
      <div><strong>Local interface preview</strong><span>Fictional data · changes reset on reload · no live actions</span></div>
      <a href="/preview/strelva/start">All interfaces</a>
      <label>Example<select value={scenario} onChange={event => { router.push(`/preview/strelva?scenario=${encodeURIComponent(event.target.value)}`); }}>{PREVIEW_SCENARIOS.map(item => <option key={item} value={item}>{item === "read-only" ? "Shared, read-only" : item.replace(/^./, letter => letter.toUpperCase())}</option>)}</select></label>
      {(scenario === "paid" || scenario === "enterprise") && <p>Relationship example only. Pricing and permissions are not simulated.</p>}
    </aside>
    <WorkspaceApp key={scenario} request={request} appBase="/preview/strelva" signOut={null} inquiry={inquiry} />
  </div>;
}
