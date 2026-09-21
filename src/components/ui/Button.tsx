"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import styles from "./primitives.module.css";

/* -------------------------------------------------- */
/*  Button                                             */
/* -------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "contrast";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  static?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Sage is the ONE brand primary — the accent, not a white fill (which read as
  // an off-brand second primary across the product). Use `contrast` only for the
  // rare single highest-emphasis action where sage isn't enough separation.
  primary:
    "bg-accent text-on-accent enabled:hover:bg-accent/85",
  secondary:
    "bg-surface text-warm-black enabled:hover:bg-gray-bg",
  ghost:
    "text-gray-muted enabled:hover:text-warm-black enabled:hover:bg-gray-bg",
  danger:
    "text-critical enabled:hover:text-on-action-danger enabled:hover:bg-action-danger",
  contrast:
    "bg-warm-white text-on-warm-white enabled:hover:bg-warm-white/90",
};

const sizeStyles: Record<ButtonSize, string | undefined> = {
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, static: isStatic, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-static={isStatic || undefined}
      className={cn(
        styles.control,
        styles.button,
        variant === "secondary" && styles.outlined,
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin shrink-0" strokeWidth={2} />
      ) : icon ? (
        <span aria-hidden="true" className={styles.icon}>{icon}</span>
      ) : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

/* -------------------------------------------------- */
/*  IconButton                                         */
/* -------------------------------------------------- */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "danger";
  loading?: boolean;
  static?: boolean;
  children: ReactNode;
}

const iconSizeStyles: Record<string, string | undefined> = {
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
};

const iconVariantStyles: Record<string, string | undefined> = {
  default: "text-gray-muted enabled:hover:text-warm-black enabled:hover:bg-gray-bg",
  ghost: "text-gray-subtle enabled:hover:text-gray-muted enabled:hover:bg-gray-bg",
  danger: "text-critical enabled:hover:text-on-action-danger enabled:hover:bg-action-danger",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "md", variant = "default", loading, static: isStatic, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-static={isStatic || undefined}
      className={cn(
        styles.control,
        styles.iconButton,
        iconSizeStyles[size],
        iconVariantStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" strokeWidth={2} /> : children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
