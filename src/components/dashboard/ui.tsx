"use client";

import {
  forwardRef,
  type SelectHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const INPUT_BASE =
  "w-full bg-surface-base border border-gray-border rounded-md px-3 py-2 text-[13px] text-warm-white outline-none focus:border-accent/40 transition-colors placeholder:text-gray-faint";

interface DashSelectOption {
  value: string;
  label: string;
}

interface DashSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: DashSelectOption[];
}

export const DashSelect = forwardRef<HTMLSelectElement, DashSelectProps>(
  ({ options, className, ...rest }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          INPUT_BASE,
          "appearance-none pr-8 cursor-pointer",
          className,
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-faint pointer-events-none"
        strokeWidth={1.5}
      />
    </div>
  ),
);
DashSelect.displayName = "DashSelect";

export function FormRow({
  label,
  description,
  children,
  last,
}: {
  label: string;
  description: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-start gap-1.5 md:gap-4 px-5 py-4",
        !last && "border-b border-gray-border/50",
      )}
    >
      <div className="md:w-[180px] shrink-0 md:pt-1.5">
        <div className="text-[13px] text-warm-white">{label}</div>
        <div className="text-[11px] text-gray-faint mt-0.5">{description}</div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function SavedToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast">
      <div className="bg-surface-raised border border-gray-border rounded-lg px-4 py-2 flex items-center gap-1.5 text-xs font-mono text-emerald-400 shadow-lg">
        <svg
          className="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Saved
      </div>
    </div>
  );
}
