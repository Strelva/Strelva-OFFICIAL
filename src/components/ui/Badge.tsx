import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type BadgeVariant = "sage" | "emerald" | "amber" | "red" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  sage: "bg-sage/10 text-sage",
  emerald: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-700",
  red: "bg-red-500/10 text-red-600",
  neutral: "bg-gray-bg text-gray-muted",
};

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider shrink-0",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
