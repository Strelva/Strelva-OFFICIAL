"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabVariant = "underline" | "pill" | "segment";
export type TabsOrientation = "horizontal" | "vertical";
export type TabsActivation = "automatic" | "manual";

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Supply a panel id when this tab controls a local tabpanel. */
  panelId?: string;
  /** Supply a stable id when a panel needs to reference this tab explicitly. */
  id?: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: TabVariant;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  orientation?: TabsOrientation;
  /** Automatic activation is appropriate for immediately available local panels. */
  activation?: TabsActivation;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tab";
}

function nextEnabledIndex(items: TabItem[], currentIndex: number, direction: 1 | -1) {
  const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);
  if (!enabled.length) return -1;
  const currentPosition = enabled.indexOf(currentIndex);
  const nextPosition = currentPosition < 0
    ? (direction === 1 ? 0 : enabled.length - 1)
    : (currentPosition + direction + enabled.length) % enabled.length;
  return enabled[nextPosition] ?? -1;
}

function focusableIndex(items: TabItem[], activeValue: string, selectedValue: string) {
  const activeIndex = items.findIndex((item) => item.value === activeValue && !item.disabled);
  if (activeIndex >= 0) return activeIndex;
  const selectedIndex = items.findIndex((item) => item.value === selectedValue && !item.disabled);
  if (selectedIndex >= 0) return selectedIndex;
  return items.findIndex((item) => !item.disabled);
}

function tabClasses(variant: TabVariant, selected: boolean) {
  const base = "flex min-h-10 items-center justify-center gap-1.5 text-sm font-medium tracking-[-0.01em] outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent-text/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  if (variant === "pill") {
    return cn(
      base,
      "rounded-full px-4 py-2",
      selected ? "bg-surface-raised text-warm-black" : "text-gray-muted hover:bg-gray-bg hover:text-warm-black",
    );
  }
  if (variant === "segment") {
    return cn(
      base,
      "rounded-full px-4 py-2",
      selected ? "bg-surface text-warm-black shadow-sm" : "text-gray-muted hover:text-warm-black",
    );
  }
  return cn(
    base,
    "rounded-xl px-4 py-2",
    selected ? "bg-gray-bg text-warm-black" : "text-gray-muted hover:bg-gray-bg/50 hover:text-warm-black",
  );
}

export function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  orientation = "horizontal",
  activation = "automatic",
}: TabsProps) {
  const generatedId = useId().replace(/:/g, "");
  const tabBaseId = id ? `${id}-tab` : `tabs-${generatedId}`;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeTabValue, setActiveTabValue] = useState(value);

  useEffect(() => {
    setActiveTabValue(value);
  }, [value]);

  const activeIndex = focusableIndex(items, activeTabValue, value);

  function activate(item: TabItem) {
    if (item.disabled) return;
    setActiveTabValue(item.value);
    onChange(item.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const tabList = event.currentTarget.closest<HTMLElement>("[role=tablist]");
    const direction = tabList && (getComputedStyle(tabList).direction === "rtl" || tabList.dir === "rtl") ? -1 : 1;
    const forwardKey = orientation === "horizontal" ? (direction === 1 ? "ArrowRight" : "ArrowLeft") : "ArrowDown";
    const backwardKey = orientation === "horizontal" ? (direction === 1 ? "ArrowLeft" : "ArrowRight") : "ArrowUp";
    let nextIndex = -1;
    if (event.key === forwardKey) nextIndex = nextEnabledIndex(items, index, 1);
    else if (event.key === backwardKey) nextIndex = nextEnabledIndex(items, index, -1);
    else if (event.key === "Home") nextIndex = nextEnabledIndex(items, -1, 1);
    else if (event.key === "End") nextIndex = nextEnabledIndex(items, -1, -1);
    else if (activation === "manual" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      activate(items[index]!);
      return;
    }

    if (nextIndex < 0) return;
    event.preventDefault();
    const nextItem = items[nextIndex];
    if (!nextItem || nextItem.disabled) return;
    setActiveTabValue(nextItem.value);
    tabRefs.current[nextIndex]?.focus();
    if (activation === "automatic") onChange(nextItem.value);
  }

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-orientation={orientation}
      data-activation={activation}
      className={cn(
        orientation === "vertical" ? "flex flex-col items-stretch gap-1" : variant === "segment" ? "flex w-fit gap-0.5 rounded-full bg-surface-inset p-0.5" : "flex flex-wrap items-center gap-1",
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = value === item.value;
        const tabId = item.id ?? `${tabBaseId}-${slug(item.value)}`;
        return (
          <button
            key={item.value}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={item.panelId}
            aria-disabled={item.disabled || undefined}
            tabIndex={index === activeIndex ? 0 : -1}
            disabled={item.disabled}
            onClick={() => activate(item)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={tabClasses(variant, selected)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  active: boolean;
  tabId: string;
}

/** A panel companion that keeps inactive content out of the focus order. */
export function TabsPanel({ active, tabId, className, children, ...rest }: TabsPanelProps) {
  return (
    <div
      {...rest}
      role="tabpanel"
      aria-labelledby={tabId}
      aria-hidden={!active}
      hidden={!active}
      tabIndex={active ? 0 : -1}
      className={className}
    >
      {children}
    </div>
  );
}
