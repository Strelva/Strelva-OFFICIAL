"use client";
/**
 * XA buttons. Pen: LX · Button · Primary (E87CJ), Secondary (sC9X5),
 * Quiet (A1nRFX), Icon button (OABIG).
 *
 * One primary per screen: the ink pill is the screen's one thing to do.
 * Everything else is secondary (white, small shadow), quiet (moss text) or a
 * text link. Each primary carries `data-xa-primary` so a screen can be
 * checked for exactly one.
 */
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./xa.module.css";

export type XaButtonVariant = "primary" | "secondary" | "quiet";
export type XaButtonSize = "sm" | "md" | "lg";

interface ButtonLook { variant?: XaButtonVariant; size?: XaButtonSize; block?: boolean }

type XaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook & {
  ref?: Ref<HTMLButtonElement>;
  /** Shows a spinner and blocks repeat presses while the caller's action runs. */
  busy?: boolean;
  /** A keyboard hint drawn inside the pill on desktop, e.g. "⌘↵". */
  hint?: string;
};

/** The XA button. Callers own what pressing it does; the button never decides authority. */
export function XaButton({ variant = "secondary", size = "md", block, busy, hint, disabled, children, type = "button", ...rest }: XaButtonProps) {
  return <button {...rest} type={type} className={styles.button} data-variant={variant} data-size={size} data-block={block || undefined} data-xa-primary={variant === "primary" || undefined} disabled={disabled || busy} aria-busy={busy || undefined}>
    {busy ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : null}
    {children}
    {/* The hint is drawn by CSS so the button's name and text stay its words alone. */}
    {hint && !busy ? <span className={styles.buttonHint} data-hint={hint} aria-hidden="true" /> : null}
  </button>;
}

/** A link that looks like an XA button. Use for navigation, never for a write. */
export function XaButtonLink({ href, variant = "secondary", size = "md", block, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & ButtonLook & { href: string; children: ReactNode }) {
  return <Link {...rest} href={href} className={styles.button} data-variant={variant} data-size={size} data-block={block || undefined} data-xa-primary={variant === "primary" || undefined}>{children}</Link>;
}

/** Round icon-only control. The label is required: it is the only thing a screen reader hears. */
export function XaIconButton({ label, children, tone = "raised", ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { ref?: Ref<HTMLButtonElement>; label: string; tone?: "raised" | "plain" | "chip"; children: ReactNode }) {
  return <button type="button" {...rest} className={styles.iconButton} data-tone={tone} aria-label={label} title={rest.title ?? label}>{children}</button>;
}

/** An inline text action, the way Strelva offers "See it · Undo" inside a sentence. */
export function XaTextLink({ href, onClick, children, disabled, ...rest }: { href?: string; onClick?: () => void; children: ReactNode; "aria-label"?: string; disabled?: boolean }) {
  if (href) return <Link href={href} className={styles.textLink} onClick={onClick} aria-label={rest["aria-label"]}>{children}</Link>;
  return <button type="button" className={styles.textLink} onClick={onClick} disabled={disabled} aria-label={rest["aria-label"]}>{children}</button>;
}
