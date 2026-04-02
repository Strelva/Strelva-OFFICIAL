"use client";

import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

const trackSize = {
  sm: "w-7 h-4",
  md: "w-9 h-5",
};

const thumbSize = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
};

const thumbTranslate = {
  sm: "translate-x-[13px]",
  md: "translate-x-[17px]",
};

export function Toggle({ checked, onChange, label, size = "md", disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative rounded-full transition-colors duration-150 shrink-0 disabled:opacity-50",
        trackSize[size],
        checked ? "bg-sage" : "bg-gray-border",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm transition-transform duration-150",
          thumbSize[size],
          checked && thumbTranslate[size],
        )}
      />
    </button>
  );
}
