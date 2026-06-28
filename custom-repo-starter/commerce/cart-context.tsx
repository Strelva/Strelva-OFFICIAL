"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Minimal cart: line items keyed by product slug, persisted to localStorage and
 * synced across tabs. Prices live in the catalog (server-side at checkout) — the
 * cart only tracks slug + quantity + a display price/name for the UI. The server
 * re-prices everything at checkout, so a tampered localStorage can't change what
 * the customer is charged.
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

function load(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.slug === "string") : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Lazy init reads localStorage once (returns [] during SSR — `load` guards on
  // `window`). Mount cart-count UI inside a client boundary if you want to avoid
  // a first-paint flash of the empty cart.
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setLines(load());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full / disabled — cart stays in memory for this tab
    }
  }, []);

  const add = useCallback<CartContextValue["add"]>(
    (line, quantity = 1) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.slug === line.slug);
        const next = existing
          ? prev.map((l) => (l.slug === line.slug ? { ...l, quantity: l.quantity + quantity } : l))
          : [...prev, { ...line, quantity }];
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  const setQuantity = useCallback<CartContextValue["setQuantity"]>(
    (slug, quantity) => {
      persist(
        quantity <= 0
          ? lines.filter((l) => l.slug !== slug)
          : lines.map((l) => (l.slug === slug ? { ...l, quantity } : l)),
      );
    },
    [lines, persist],
  );

  const remove = useCallback((slug: string) => persist(lines.filter((l) => l.slug !== slug)), [lines, persist]);
  const clear = useCallback(() => persist([]), [persist]);

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
