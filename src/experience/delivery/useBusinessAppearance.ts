"use client";

import { useSyncExternalStore } from "react";

type Appearance = "system" | "light" | "dark";
const key = "strelva:business:appearance";
const event = "strelva:appearance-change";
let memory: Appearance | undefined;
function preference(): Appearance {
  try {
    const value = localStorage.getItem(key);
    return memory ?? (value === "light" || value === "dark" ? value : "system");
  } catch { return memory ?? "system"; }
}
function snapshot() {
  const selected = preference();
  const dark = selected === "dark" || (selected === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  return `${selected}:${dark ? "dark" : "light"}`;
}
function subscribe(notify: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const storage = () => { memory = undefined; notify(); };
  media.addEventListener("change", notify);
  window.addEventListener(event, notify);
  window.addEventListener("storage", storage);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener(event, notify);
    window.removeEventListener("storage", storage);
  };
}
export function useBusinessAppearance() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [storedAppearance, storedTheme] = value.split(":");
  const appearance: Appearance = storedAppearance === "light" || storedAppearance === "dark"
    ? storedAppearance
    : "system";
  const theme: "light" | "dark" = storedTheme === "dark" ? "dark" : "light";
  return { appearance, theme, setAppearance(next: Appearance) {
    memory = next;
    try { localStorage.setItem(key, next); } catch { /* Keep this session usable without storage. */ }
    window.dispatchEvent(new Event(event));
  } };
}
