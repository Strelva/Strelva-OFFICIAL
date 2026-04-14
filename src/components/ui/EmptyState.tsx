import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-12", className)}>
      {icon && (
        <div className="w-10 h-10 rounded-2xl bg-surface flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-normal text-warm-black mb-1.5">{title}</p>
      {description && (
        <p className="text-[13px] text-gray-muted max-w-[280px] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
