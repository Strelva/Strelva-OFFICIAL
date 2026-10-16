"use client";
/**
 * Which business (shaped like XA · B2): the businesses this account can open,
 * each a row that opens it, beside Pebble in the felt. No sidebar: nothing
 * is open yet, so there is nothing to navigate.
 */
import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { XaButtonLink, XaField, XaHeadline, XaInitial, XaMark, XaPebbleScene, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./business-picker.module.css";

export type BusinessPickerItem = { id: string; name: string };

export function BusinessPicker({ businesses, accountName, mode }: { businesses: BusinessPickerItem[]; accountName?: string; mode?: "light" | "dark" }) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const visible = businesses.filter((business) => business.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className={styles.page} data-workspace-theme="linen" data-workspace-look="xa" data-workspace-mode={mode}>
    <main className={styles.lead} id="strelva-main">
      <header className={styles.top}>
        <span className={styles.brand}><XaMark size={28} /><span>Strelva</span></span>
        {accountName ? <span className={styles.account}>{accountName}</span> : null}
      </header>
      <div className={styles.body}>
        <XaHeadline quiet={businesses.length > 1 ? "Each one keeps its own inquiries and records." : undefined}>{businesses.length ? "Which business?" : "No business here yet."}</XaHeadline>
        {businesses.length > 5 ? <XaField ref={search} id="business-search" type="search" label="Search businesses" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" /> : null}
        {businesses.length === 0 ? <div className={styles.empty}>
          <p>No businesses are connected to this account. If you expected one, its owner may still need to add you.</p>
          <XaButtonLink variant="primary" href="/account?managed=1">Review account access</XaButtonLink>
        </div> : visible.length === 0 ? <div className={styles.empty}>
          <p>No businesses match &ldquo;{query.trim()}&rdquo;.</p>
          <XaTextLink onClick={() => { setQuery(""); search.current?.focus(); }}>Clear search</XaTextLink>
        </div> : <ul className={styles.list} aria-label="Your businesses">{visible.map((business) => <li key={business.id}>
          <a className={styles.row} href={`/business/${encodeURIComponent(business.id)}`}>
            <XaInitial name={business.name} size={32} />
            <span className={styles.name}>{business.name}</span>
            <span className={styles.open}>Open<ChevronRight size={16} aria-hidden="true" /></span>
          </a>
        </li>)}</ul>}
      </div>
    </main>
    <aside className={styles.felt} aria-label="Pebble">
      <XaPebbleScene pose="lineup" size={360} bare />
      <p className={styles.feltTitle}>Pebble keeps each business apart.</p>
      <p className={styles.feltBody}>Inquiries, replies and records never mix between businesses.</p>
    </aside>
  </div>;
}
