"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------- */
/*  Button                                             */
/* -------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-sage text-white hover:bg-sage-dark disabled:opacity-50",
  secondary:
    "bg-white border border-gray-border text-warm-black hover:bg-gray-bg disabled:opacity-50",
  ghost:
    "text-gray-muted hover:text-warm-black hover:bg-gray-bg disabled:opacity-50",
  danger:
    "text-terra hover:text-white hover:bg-terra disabled:opacity-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-[11px] gap-1 rounded-md",
  md: "px-3 py-1.5 text-[13px] gap-1.5 rounded-md",
  lg: "px-4 py-2.5 text-[13px] gap-2 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150 shrink-0",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" strokeWidth={1.5} />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
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
  children: ReactNode;
}

const iconSizeStyles: Record<string, string> = {
  sm: "w-8 h-8 min-w-[32px] min-h-[32px]",
  md: "w-10 h-10 min-w-[40px] min-h-[40px]",
  lg: "w-11 h-11 min-w-[44px] min-h-[44px]",
};

const iconVariantStyles: Record<string, string> = {
  default: "text-gray-muted hover:text-warm-black hover:bg-gray-bg",
  ghost: "text-gray-subtle hover:text-gray-muted hover:bg-gray-bg",
  danger: "text-gray-subtle hover:text-terra hover:bg-terra/5",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "md", variant = "default", loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      aria-label={label}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors duration-150 shrink-0 disabled:opacity-50",
        iconSizeStyles[size],
        iconVariantStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
