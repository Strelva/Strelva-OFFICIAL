import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Fill the available canvas (centers vertically in a tall min-height) instead
   *  of a short box. Use on PAGE-level empty states so they don't leave a void;
   *  leave off inside a panel/card. */
  fill?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, fill, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        fill ? "min-h-[58vh] py-16" : "py-14",
        className,
      )}
    >
      {icon && (
        <div className="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-glass-border bg-glass text-accent-text">
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl opacity-60"
            style={{ background: "radial-gradient(circle at 50% 35%, var(--color-accent-dim), transparent 70%)" }}
          />
          <span className="relative">{icon}</span>
        </div>
      )}
      <h3 className="font-display text-[21px] leading-tight tracking-[-0.01em] text-warm-black">{title}</h3>
      {description && (
        <p className="mt-2.5 max-w-[360px] text-[14px] leading-relaxed text-gray-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
