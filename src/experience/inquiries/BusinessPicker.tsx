"use client";

import { useRef, useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StEmpty, StField, StHead, StPage, StRow, StRows, StTextButton } from "@/components/ui/strelva/Kit";

export type BusinessPickerItem = { id: string; name: string };

export function BusinessPicker({ businesses }: { businesses: BusinessPickerItem[] }) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const visible = businesses.filter((business) => business.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <StrelvaShell title="Your businesses" signedIn onSearch={() => search.current?.focus()} onStart={() => { setQuery(""); search.current?.focus(); }}>
    <StPage>
      <StHead title="Choose your business" meta="Open a business to start or resume work." />
      <StField label="Search businesses"><input ref={search} id="business-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></StField>
      {businesses.length === 0 ? <StEmpty action={<StTextButton href="/account?managed=1">Review account access</StTextButton>}>No businesses are connected to this account.</StEmpty>
        : visible.length === 0 ? <StEmpty action={<StTextButton onClick={() => { setQuery(""); search.current?.focus(); }}>Clear search</StTextButton>}>No businesses match.</StEmpty>
        : <StRows label="Your businesses">{visible.map((business) => <StRow key={business.id} title={business.name} href={`/business/${encodeURIComponent(business.id)}`} />)}</StRows>}
    </StPage>
  </StrelvaShell>;
}
