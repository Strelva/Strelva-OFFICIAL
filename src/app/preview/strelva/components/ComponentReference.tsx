"use client";

import { useRef, useState } from "react";
import { ArrowRight, FileText, Globe2, X } from "lucide-react";
import { AtmosphericCard } from "@/components/ui/atmosphere/AtmosphericCard";
import { AtmosphericCardHeader, AtmosphericCardDetail, AtmosphericCardFooter } from "@/components/ui/atmosphere/AtmosphericCardParts";
import { Button, IconButton } from "@/components/ui/Button";
import { GooeyDisclosure } from "@/components/ui/motion/GooeyDisclosure";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { Tabs, TabsPanel } from "@/components/ui/Tabs";
import { Toggle } from "@/components/ui/Toggle";
import { StrelvaLogoSwitch } from "@/components/brand/StrelvaLogoSwitch";
import { LogoMark } from "@/components/Logo";
import styles from "./components.module.css";

const materials = ["Sage rift", "Cloud banks", "Mineral veil", "Undercurrent", "The opening", "Silver mist"];
type ExampleState = "ready" | "empty" | "loading" | "unavailable" | "read-only";
const foundationTabs = [
  { value: "fields", label: "Fields", id: "foundation-tab-fields", panelId: "foundation-panel-fields" },
  { value: "keyboard", label: "Keyboard", id: "foundation-tab-keyboard", panelId: "foundation-panel-keyboard" },
  { value: "states", label: "States", id: "foundation-tab-states", panelId: "foundation-panel-states" },
];

export function ComponentReference({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [logoReplay, setLogoReplay] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const [state, setState] = useState<ExampleState>("ready");
  const [paused, setPaused] = useState<boolean[]>(materials.map(() => false));
  const [selected, setSelected] = useState("");
  const [motionOpen, setMotionOpen] = useState(true);
  const [checked, setChecked] = useState(true);
  const [foundationTab, setFoundationTab] = useState("fields");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  function changeTheme(next: "light" | "dark") {
    setTheme(next);
    const url = new URL(window.location.href);
    url.searchParams.set("theme", next);
    window.history.replaceState(null, "", url);
  }
  return <main className={styles.page} data-dashboard={theme === "dark" ? "" : undefined} data-theme={theme}>
    <a href="#component-examples" className={styles.skip}>Skip to components</a>
    <header className={styles.header}>
      <a href="/preview/strelva?scenario=free" className={styles.brand}><LogoMark className={styles.mark} /><span className="font-display">Strelva</span></a>
      <span className={styles.previewLabel}>Local component study</span>
      <a href="/preview/strelva/colors">Color reference <ArrowRight size={16} /></a>
    </header>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>Material, light, and useful detail</p>
      <h1>Depth around the work.</h1>
      <p>Moving cloud material, a frosted outer surface, and sharp content. Six treatments to compare, using the same product components.</p>
    </div>
    <section className={styles.logoStudy} aria-label="Animated Strelva lockup"><StrelvaLogoSwitch key={logoReplay} animated paused={paused.every(Boolean)} /><Button variant="secondary" onClick={() => setLogoReplay(value => value + 1)}>Replay logo</Button></section>
    <div className={styles.toolbar} aria-label="Component examples">
      <label>Appearance<select aria-label="Appearance" value={theme} onChange={event => changeTheme(event.target.value as "light" | "dark")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>Example state<select aria-label="Example state" value={state} onChange={event => setState(event.target.value as ExampleState)}><option value="ready">Ready to review</option><option value="empty">Empty</option><option value="loading">Loading</option><option value="unavailable">Unavailable</option><option value="read-only">Read-only</option></select></label>
      <Button variant="secondary" aria-pressed={paused.every(Boolean)} onClick={() => setPaused(materials.map(() => !paused.every(Boolean)))}>{paused.every(Boolean) ? "Resume all motion" : "Pause all motion"}</Button>
      <p>Fictional examples. No saved work changes.</p>
    </div>
    <section id="component-examples" aria-label="Atmospheric card treatments" className={styles.gallery}>
      {materials.map((name, index) => <div key={name} className={styles.specimen}>
        <div className={styles.caption}><span>{String(index + 1).padStart(2, "0")}</span><h2>{name}</h2></div>
        <AtmosphericCard theme={theme} variant={index as 0 | 1 | 2 | 3 | 4 | 5} paused={paused[index]} onPausedChange={value => setPaused(current => current.map((item, i) => i === index ? value : item))} contentClassName={styles.cardContent}>
          <AtmosphericCardHeader icon={<Globe2 size={20} />} className={styles.cardHeading}><span><p>Website</p><h3>{state === "empty" ? "Room for your next idea." : "A clearer first impression."}</h3></span></AtmosphericCardHeader>
          <p className={styles.description}>{state === "empty" ? "Bring a page, a question, or a change you want to make." : state === "unavailable" ? "The example draft could not be loaded. Your existing work is still here." : state === "loading" ? "Opening the example draft…" : "Review the wording and layout together before deciding what to publish."}</p>
          {state !== "empty" && <AtmosphericCardDetail className={styles.context} aria-busy={state === "loading"}>
            <FileText size={20} aria-hidden="true" /><div><strong>{state === "loading" ? "Loading draft" : "Homepage introduction"}</strong><p>{state === "read-only" ? "Shared for viewing · Changes require owner access" : "Example draft · Nothing has been published"}</p></div>
          </AtmosphericCardDetail>}
          <AtmosphericCardFooter className={styles.cardActions}><span>{state === "read-only" ? "View access" : "Example workspace"}</span><Button variant="secondary" loading={state === "loading"} onClick={event => { trigger.current = event.currentTarget; setSelected(name); dialog.current?.showModal(); }}>{state === "unavailable" ? "Try again" : state === "empty" ? "Start an example" : "View example"}<ArrowRight size={16} aria-hidden="true" /></Button></AtmosphericCardFooter>
        </AtmosphericCard>
      </div>)}
    </section>
    <section className={styles.primitives} aria-labelledby="motion-foundation"><h2 id="motion-foundation">Gooey disclosure</h2><Button variant="secondary" aria-expanded={motionOpen} aria-controls="motion-example" onClick={() => setMotionOpen(value => !value)}>{motionOpen ? "Collapse example" : "Expand example"}</Button><GooeyDisclosure open={motionOpen} id="motion-example"><Card className="mt-4"><p>The surface settles with a soft spring. Text stays sharp and controls remain usable.</p><Button variant="secondary" onClick={event => { trigger.current = event.currentTarget; setSelected("Motion example"); dialog.current?.showModal(); }}>Inspect motion example</Button></Card></GooeyDisclosure></section>
    <section className={styles.primitives} aria-labelledby="shared-controls"><h2 id="shared-controls">Shared controls</h2><p>Clear targets, consistent geometry, and visible state.</p><Card><div className={styles.controlRow}><Button size="sm">Compact</Button><Button variant="secondary">Standard</Button><Button variant="ghost">Quiet action</Button><Button variant="danger">Destructive</Button><Button loading>Saving example</Button><Button disabled>Unavailable</Button><Toggle label="Example notifications" checked={checked} onChange={setChecked} /></div></Card></section>
    <section className={styles.primitives} aria-labelledby="foundation-atoms"><h2 id="foundation-atoms">Foundation atoms</h2><p>Actual REB fields expose their labels, descriptions, validation and native states.</p><Card><div className={styles.foundationGrid}>
      <TextInput id="reference-business" label="Business name" defaultValue="Northwind Field Services" helperText="Shown to customers in shared work." />
      <TextInput id="reference-email" label="Contact email" defaultValue="owner@northwind" error="Use an email address such as owner@northwind.com." />
      <TextArea id="reference-request" label="Work request" defaultValue="Keep the existing wording available while the draft is reviewed." helperText="Long content remains readable as the field grows." />
      <SelectInput id="reference-state" label="Access state" options={[{ value: "owner", label: "Owner access" }, { value: "viewer", label: "View only" }, { value: "pending", label: "Pending review" }]} defaultValue="viewer" />
      <TextInput id="reference-readonly" label="Read-only value" value="Verified source · 24 Sep" readOnly />
      <TextInput id="reference-disabled" label="Unavailable value" value="Requires owner access" disabled readOnly />
    </div></Card></section>
    <section className={styles.primitives} aria-labelledby="foundation-tabs-heading"><h2 id="foundation-tabs-heading">Tabs and panels</h2><p>Arrow keys move the roving tab stop; local panels expose their relationship and hide inactive content.</p><Card><Tabs id="foundation-tabs" aria-label="Foundation examples" items={foundationTabs} value={foundationTab} onChange={setFoundationTab} /><div className={styles.tabPanelGroup}>
      <TabsPanel id="foundation-panel-fields" tabId="foundation-tab-fields" active={foundationTab === "fields"}><p className={styles.tabPanelTitle}>Field associations</p><p>Labels, helper text and errors use generated IDs merged with caller-provided descriptions.</p></TabsPanel>
      <TabsPanel id="foundation-panel-keyboard" tabId="foundation-tab-keyboard" active={foundationTab === "keyboard"}><p className={styles.tabPanelTitle}>Keyboard behavior</p><p>Use Tab to enter the selected tab, then Arrow keys, Home or End to move through the set.</p></TabsPanel>
      <TabsPanel id="foundation-panel-states" tabId="foundation-tab-states" active={foundationTab === "states"}><p className={styles.tabPanelTitle}>State coverage</p><p>Default, invalid, read-only, disabled and long-content examples are rendered above in both themes.</p></TabsPanel>
    </div></Card></section>
    <dialog ref={dialog} aria-labelledby="component-dialog-title" className={styles.dialog} onClose={() => trigger.current?.focus()}>
      <div className={styles.dialogHeading}><h2 id="component-dialog-title">{selected}</h2><IconButton label="Close example" onClick={() => dialog.current?.close()}><X size={20} /></IconButton></div>
      <p>This is a local component example. Opening it does not publish a website or change saved work.</p>
      <Button variant="secondary" onClick={() => dialog.current?.close()}>Back to components</Button>
    </dialog>
  </main>;
}
