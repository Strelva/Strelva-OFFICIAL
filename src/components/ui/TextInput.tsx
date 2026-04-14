"use client";

import { forwardRef, useId, useRef, useEffect, useCallback, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "w-full bg-surface border border-gray-border rounded-md px-3 py-1.5 text-[13px] text-warm-black placeholder-gray-subtle outline-none focus:border-sage focus:ring-1 focus:ring-sage/20 transition-all duration-150";

/* -------------------------------------------------- */
/*  TextInput (text, url, tel, email, date)            */
/* -------------------------------------------------- */

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, helperText, className, id: idProp, ...rest }, ref) => {
    const autoId = useId();
    const id = idProp || autoId;
    return (
      <div>
        {label && (
          <label htmlFor={id} className="block text-[11px] text-gray-muted mb-0.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(BASE, error && "border-terra focus:border-terra focus:ring-terra/20", className)}
          {...rest}
        />
        {error && <p className="text-[11px] text-terra mt-0.5">{error}</p>}
        {helperText && !error && <p className="text-[11px] text-gray-muted mt-0.5">{helperText}</p>}
      </div>
    );
  },
);
TextInput.displayName = "TextInput";

/* -------------------------------------------------- */
/*  TextArea                                           */
/* -------------------------------------------------- */

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, className, id: idProp, onChange, ...rest }, ref) => {
    const autoId = useId();
    const id = idProp || autoId;
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    const autoResize = useCallback(() => {
      const el = internalRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 48)}px`;
    }, []);

    useEffect(() => {
      autoResize();
    }, [autoResize, rest.value]);

    return (
      <div>
        {label && (
          <label htmlFor={id} className="block text-[11px] text-gray-muted mb-0.5">
            {label}
          </label>
        )}
        <textarea
          ref={(el) => {
            internalRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          id={id}
          rows={2}
          className={cn(BASE, "resize-none leading-relaxed overflow-hidden", error && "border-terra", className)}
          onChange={(e) => {
            onChange?.(e);
            autoResize();
          }}
          {...rest}
        />
        {error && <p className="text-[11px] text-terra mt-0.5">{error}</p>}
      </div>
    );
  },
);
TextArea.displayName = "TextArea";

/* -------------------------------------------------- */
/*  Select                                             */
/* -------------------------------------------------- */

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ label, options, error, className, id: idProp, ...rest }, ref) => {
    const autoId = useId();
    const id = idProp || autoId;
    return (
      <div>
        {label && (
          <label htmlFor={id} className="block text-[11px] text-gray-muted mb-0.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(BASE, "appearance-none", error && "border-terra", className)}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-[11px] text-terra mt-0.5">{error}</p>}
      </div>
    );
  },
);
SelectInput.displayName = "SelectInput";

/* -------------------------------------------------- */
/*  FieldLabel (standalone, for custom layouts)        */
/* -------------------------------------------------- */

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] text-gray-muted mb-0.5">
      {children}
    </label>
  );
}
