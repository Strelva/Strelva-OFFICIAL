"use client";

import { cn } from "@/lib/cn";
import styles from "./primitives.module.css";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

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
        styles.control,
        styles.toggle,
        size === "sm" && styles.toggleSmall,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          styles.toggleTrack,
          checked ? "bg-accent" : "bg-gray-border",
        )}
      >
        <span className={cn(styles.toggleThumb, checked ? "bg-on-accent" : "bg-control-thumb")} />
      </span>
    </button>
  );
}
