"use client";

import {
  forwardRef,
  useId,
  isValidElement,
  cloneElement,
  type SelectHTMLAttributes,
  type ReactNode,
  type ReactElement,
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
  // Associate the visible label with the field for screen readers: when the
  // child is a single element without its own id, inject a generated one and
  // point the <label htmlFor> at it. Falls back to a plain label otherwise.
  const fieldId = useId();
  const canLabel =
    isValidElement(children) &&
    (children as ReactElement<{ id?: string }>).props.id === undefined;
  const field = canLabel
    ? cloneElement(children as ReactElement<{ id?: string }>, { id: fieldId })
    : children;

  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-start gap-1.5 md:gap-4 px-5 py-4",
        !last && "border-b border-gray-border/50",
      )}
    >
      <div className="md:w-[180px] shrink-0 md:pt-1.5">
        <label htmlFor={canLabel ? fieldId : undefined} className="block text-[13px] text-warm-white">
          {label}
        </label>
        <div className="text-[11px] text-gray-faint mt-0.5">{description}</div>
      </div>
      <div className="flex-1">{field}</div>
    </div>
  );
}
