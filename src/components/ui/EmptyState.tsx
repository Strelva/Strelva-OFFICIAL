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
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-8", className)}>
      {icon && (
        <div className="w-10 h-10 rounded-lg bg-gray-bg flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <p className="text-[13px] font-medium text-warm-black mb-1">{title}</p>
      {description && (
        <p className="text-[12px] text-gray-muted max-w-[260px]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
