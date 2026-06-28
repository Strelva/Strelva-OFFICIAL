"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/**
 * Minimal cart: line items keyed by product slug, persisted to localStorage and
 * synced across tabs AND restored on same-tab reload. Backed by
 * useSyncExternalStore so localStorage is the single source of truth — no
 * useState/useEffect hydration dance, no lost cart on refresh.
 *
 * Prices here are for display only; checkout re-prices everything server-side
 * from the catalog, so a tampered localStorage can't change what's charged.
 */
export interface CartLine {
  slug: string;
  name: string;
  priceCents: number;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
  count: number;
  subtotalCents: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "cart:v1";
const CHANGE_EVENT = "cart:changed";
const EMPTY: CartLine[] = [];

// Module-level cache so getSnapshot returns a STABLE reference while the stored
// string is unchanged — re-parsing on every call would return a new array each
// time and spin useSyncExternalStore into an infinite render loop.
let cachedRaw: string | null = null;
let cachedLines: CartLine[] = EMPTY;

function readSnapshot(): CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedLines;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    cachedLines = Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.slug === "string") : EMPTY;
  } catch {
    cachedLines = EMPTY;
  }
  return cachedLines;
}

function serverSnapshot(): CartLine[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab's mutations
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(next: CartLine[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full / disabled — nothing persisted, but the event still fires so
    // the in-memory snapshot updates for this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);

  const add = useCallback<CartContextValue["add"]>((line, quantity = 1) => {
    const cur = readSnapshot();
    const existing = cur.find((l) => l.slug === line.slug);
    write(
      existing
        ? cur.map((l) => (l.slug === line.slug ? { ...l, quantity: l.quantity + quantity } : l))
        : [...cur, { ...line, quantity }],
    );
  }, []);

  const setQuantity = useCallback<CartContextValue["setQuantity"]>((slug, quantity) => {
    const cur = readSnapshot();
    write(quantity <= 0 ? cur.filter((l) => l.slug !== slug) : cur.map((l) => (l.slug === slug ? { ...l, quantity } : l)));
  }, []);

  const remove = useCallback((slug: string) => write(readSnapshot().filter((l) => l.slug !== slug)), []);
  const clear = useCallback(() => write([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      add,
      setQuantity,
      remove,
      clear,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotalCents: lines.reduce((n, l) => n + l.priceCents * l.quantity, 0),
    }),
    [lines, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
