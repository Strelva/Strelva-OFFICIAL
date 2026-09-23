"use client";

/** Shared, token-based admin form primitives for onboarding, pay links, and client access. */

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

const inputClass =
  "w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 transition-colors";

const labelClass = "block text-xs text-gray-muted mb-1";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {hint && <p className="mt-1 text-[11px] text-gray-faint">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {children}
      </select>
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-muted cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

/** Primary action button — the system CTA. Sage fill with dark on-accent ink
 *  (the ONE primary style; secondary actions use GhostButton). */
/** Admin primary CTA — now the SHARED Button (one button system, one sage
 *  primary, one pill radius) instead of a duplicate. Kept as a thin alias so the
 *  18+ admin call sites don't churn. */
export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <Button variant="primary" size="md" type={type} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

/** Secondary/ghost button. */
export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-3 py-2 text-sm text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
