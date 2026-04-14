"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type TabVariant = "underline" | "pill" | "segment";

interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: TabVariant;
  className?: string;
}

/* ----- Underline tabs (nav-style) ----- */
function UnderlineTabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "flex items-center gap-1.5 h-full px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-150 rounded-lg",
            value === item.value
              ? "text-warm-black bg-gray-bg"
              : "text-gray-muted hover:text-warm-black hover:bg-gray-bg/50",
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ----- Pill tabs ----- */
function PillTabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "px-3.5 py-1.5 rounded-full text-[13px] font-medium tracking-[-0.01em] transition-all duration-150",
            value === item.value
              ? "bg-surface-raised text-warm-black"
              : "text-gray-muted hover:text-warm-black hover:bg-gray-bg",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ----- Segmented control ----- */
function SegmentTabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-0.5 bg-surface-inset rounded-full p-0.5 w-fit", className)}
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] rounded-full transition-colors duration-150",
            value === item.value
              ? "bg-surface text-warm-black"
              : "text-gray-muted hover:text-warm-black",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs(props: TabsProps) {
  const { variant = "underline" } = props;
  if (variant === "pill") return <PillTabs {...props} />;
  if (variant === "segment") return <SegmentTabs {...props} />;
  return <UnderlineTabs {...props} />;
}
