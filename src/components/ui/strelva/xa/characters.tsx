"use client";
/**
 * XA characters. Pen: LX · System · website … phone (lSPfW, uqZ37, vnAuu,
 * pQ1xp, elVAY, Smknx, xfr7S, yIwSN, EQinR, GQmKR), LX · Pebble · Avatar
 * (gxqij), and the felt circle with a pose from the XA screens (O1 "Felt").
 *
 * Systems are clay tiles and are never shown sad: state sits beside a tile,
 * never on it. Pebble appears where Strelva speaks and is always doing a job;
 * a pose changes only when the work changes (Base crossfade, no idle motion).
 * Art lives in public/xa (cropped from design/generated-*.png|webp).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import styles from "./xa.module.css";

export type XaSystemKind = "website" | "bookings" | "inbox" | "form" | "listing" | "reviews" | "newsletter" | "payments" | "documents" | "phone";

export const XA_SYSTEM_KINDS: readonly XaSystemKind[] = ["website", "bookings", "inbox", "form", "listing", "reviews", "newsletter", "payments", "documents", "phone"];

const KIND_ALIASES: Readonly<Record<string, XaSystemKind>> = {
  website: "website", websites: "website", site: "website", managed_presence: "website",
  bookings: "bookings", scheduling: "bookings", booking: "bookings",
  inquiries: "inbox", inbox: "inbox", email: "inbox",
  form: "form", forms: "form", onboarding: "form", app: "form", applications: "form", "custom-applications": "form", tracker: "form",
  listing: "listing", google: "listing", home_finder: "listing", places: "listing",
  reviews: "reviews", newsletter: "newsletter",
  payments: "payments", store: "payments", deposit: "payments", invoices: "payments",
  document: "documents", documents: "documents",
  phone: "phone", texts: "phone",
};

/** Any System, pinned-item or product kind to its clay. Unknown kinds read as a form. */
export function xaSystemKind(kind: string | null | undefined): XaSystemKind {
  return (kind && KIND_ALIASES[kind]) || "form";
}

/** A System's clay face. Decorative beside its name; pass `label` when it stands alone. */
export function XaSystemTile({ kind, size = 40, label }: { kind: string | null | undefined; size?: number; label?: string }) {
  const clay = xaSystemKind(kind);
  return <span className={styles.tile} style={{ "--xa-size": `${size}px` } as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <img src={`/xa/system-${clay}.webp`} alt="" width={size} height={size} draggable={false} decoding="async" />
  </span>;
}

/** The dashed "add" tile that sits where the next System would. */
export function XaAddTile({ size = 26 }: { size?: number }) {
  return <span className={styles.tileAdd} style={{ "--xa-size": `${size}px` } as CSSProperties} aria-hidden="true"><Plus size={Math.round(size * 0.54)} /></span>;
}

/** Pebble's face, wherever Strelva itself speaks. */
export function XaPebbleAvatar({ size = 40, label }: { size?: number; label?: string }) {
  return <span className={styles.pebble} style={{ "--xa-size": `${size}px` } as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <img src="/xa/pebble-avatar.webp" alt="" width={size} height={size} draggable={false} decoding="async" />
  </span>;
}

/**
 * Pebble's poses, each tied to a job:
 * - resting: a normal day, beside the bookings calendar (O1)
 * - fixing: something broke and Pebble is already on it (AG1, bad news)
 * - waving: first run, or someone new arrives (C2, E-flows)
 * - adds: a System is being added (B5, AS6)
 * - lineup: every System at once (B6, A3)
 * - alone: Pebble by itself, where Strelva speaks at length
 * - website: the website clay alone, for site-only moments
 */
export type XaPose = "resting" | "fixing" | "waving" | "adds" | "lineup" | "alone" | "website";
export const XA_POSES: readonly XaPose[] = ["resting", "fixing", "waving", "adds", "lineup", "alone", "website"];

/**
 * A felt circle with one pose. Changing `pose` crossfades on Base; nothing
 * moves otherwise. `bare` drops the felt for inline art.
 */
export function XaPebbleScene({ pose, size = 320, label, bare = false }: { pose: XaPose; size?: number; label?: string; bare?: boolean }) {
  const [shown, setShown] = useState<{ current: XaPose; leaving: XaPose | null }>({ current: pose, leaving: null });
  const timer = useRef<number | null>(null);
  if (shown.current !== pose) setShown({ current: pose, leaving: shown.current });
  useEffect(() => {
    if (!shown.leaving) return;
    if (timer.current) window.clearTimeout(timer.current);
    // Fixture-free choreography: drop the outgoing pose after the Base crossfade.
    timer.current = window.setTimeout(() => setShown(state => ({ ...state, leaving: null })), 240);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [shown.leaving]);
  return <span className={styles.scene} data-bare={bare || undefined} style={{ "--xa-size": `${size}px` } as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {shown.leaving ? <img key={shown.leaving} className={styles.sceneArt} data-leaving="true" src={`/xa/pose-${shown.leaving}.webp`} alt="" draggable={false} /> : null}
    <img key={shown.current} className={styles.sceneArt} src={`/xa/pose-${shown.current}.webp`} alt="" draggable={false} decoding="async" />
  </span>;
}
