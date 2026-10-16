"use client";
/**
 * Which business (shaped like XA · B2): the businesses this account can
 * open, as open rows on the canvas. Each row is the link, carries the
 * business's own identity color and one fact that tells it apart (who runs
 * it, its site). No sidebar: nothing is open yet, so there is nothing to
 * navigate. No Pebble panel: there is nothing for Pebble to do here yet.
 */
import { useRef, useState } from "react";
import { XaButtonLink, XaField, XaHeadline, XaInitial, XaMark, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./business-picker.module.css";

export type BusinessPickerItem = { id: string; name: string; detail?: string; color?: string };

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
            <XaInitial name={business.name} size={36} color={business.color} />
            <span className={styles.text}><span className={styles.name}>{business.name}</span>{business.detail ? <span className={styles.detail}>{business.detail}</span> : null}</span>
          </a>
        </li>)}</ul>}
      </div>
    </main>
  </div>;
}
