"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AppFrame } from "@/experience/app-frame/AppFrame";

export type BusinessPickerItem = { id: string; name: string };

export function BusinessPicker({ businesses }: { businesses: BusinessPickerItem[] }) {
  const [query, setQuery] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const visible = businesses.filter((business) => business.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div data-dashboard className="min-h-dvh bg-surface-base text-warm-black">
    <AppFrame
      navigationLabel="Strelva navigation"
      navigationOpen={navigationOpen}
      onCloseNavigation={() => setNavigationOpen(false)}
      navigationTriggerRef={menu}
      navigation={<nav className="flex h-full flex-col gap-5 p-6" aria-label="Main">
        <Link href="/business" className="font-display text-2xl">Strelva</Link>
        <button type="button" className="text-left" onClick={() => { setNavigationOpen(false); setQuery(""); search.current?.focus(); }}>New</button>
        <button type="button" className="text-left" onClick={() => { setNavigationOpen(false); search.current?.focus(); }}>Search</button>
        <Link href="/business" aria-current="page">Your businesses</Link>
        <span className="text-sm text-gray-muted">Choose a business to see recent work.</span>
        <Link href="/workspace/account" className="mt-auto">Account</Link>
      </nav>}
      header={<div className="flex items-center gap-4 px-6 py-4 text-sm"><button ref={menu} type="button" className="min-h-11 lg:hidden" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}>Menu</button><span>Your businesses</span></div>}
    >
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl">Choose your business.</h1>
        <p className="mt-4 text-gray-muted">Open a business to start or resume work.</p>
        <label className="mt-8 block text-sm" htmlFor="business-search">Search businesses</label>
        <input ref={search} id="business-search" value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-11 w-full border-b border-current bg-transparent py-3 outline-offset-4" />
        {businesses.length === 0 ? <p className="mt-8">No businesses are connected to this account. <Link href="/account?managed=1" className="underline">Review account access</Link></p>
          : visible.length === 0 ? <p className="mt-8">No businesses match. <button type="button" className="underline" onClick={() => setQuery("")}>Clear search</button></p>
          : <ul className="mt-6 divide-y divide-white/10">{visible.map((business) => <li key={business.id}>
            <Link href={`/business/${encodeURIComponent(business.id)}`} className="block py-5 text-lg underline-offset-4 hover:underline">{business.name}</Link>
          </li>)}</ul>}
      </div>
    </AppFrame>
  </div>;
}
