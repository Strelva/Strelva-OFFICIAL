"use client";

import { forwardRef, useId, useRef, useEffect, useCallback, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "w-full min-h-10 bg-surface-inset border border-gray-border rounded-xl px-4 py-2 text-base sm:text-sm leading-5 text-warm-black placeholder-gray-subtle outline-none transition-colors duration-150 focus:border-accent-text focus-visible:ring-2 focus-visible:ring-accent-text/40 disabled:cursor-not-allowed disabled:opacity-60";

function mergeDescribedBy(...ids: Array<string | undefined>) {
  const seen = new Set<string>();
  return ids
    .flatMap((value) => value?.split(/\s+/) ?? [])
    .filter((value) => value && !seen.has(value) && seen.add(value))
    .join(" ");
}

function fieldIds(id: string, helperText?: string, error?: string) {
  return {
    helperId: helperText && !error ? `${id}-description` : undefined,
    errorId: error ? `${id}-error` : undefined,
  };
}

function FieldMessage({ id, children, error = false }: { id: string; children: ReactNode; error?: boolean }) {
  return (
    <p id={id} className={cn("text-xs leading-4", error ? "text-terra" : "text-gray-muted")} role={error ? "alert" : undefined}>
      {children}
    </p>
  );
}

/* -------------------------------------------------- */
/*  TextInput (text, url, tel, email, date)            */
/* -------------------------------------------------- */

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, helperText, className, id: idProp, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...rest }, ref) => {
    const autoId = useId();
    const id = idProp || autoId;
    const { helperId, errorId } = fieldIds(id, helperText, error);
    const describedBy = mergeDescribedBy(ariaDescribedBy, helperId, errorId);
    return (
      <div className="grid gap-1">
        {label && (
          <label htmlFor={id} className="block text-xs leading-4 text-gray-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : ariaInvalid}
          className={cn(BASE, error && "border-terra focus:border-terra focus-visible:ring-terra/40", className)}
          {...rest}
        />
        {errorId && <FieldMessage id={errorId} error>{error}</FieldMessage>}
        {helperId && <FieldMessage id={helperId}>{helperText}</FieldMessage>}
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
  helperText?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, helperText, className, id: idProp, onChange, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...rest }, ref) => {
    const autoId = useId();
    const id = idProp || autoId;
    const { helperId, errorId } = fieldIds(id, helperText, error);
    const describedBy = mergeDescribedBy(ariaDescribedBy, helperId, errorId);
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
      <div className="grid gap-1">
        {label && (
          <label htmlFor={id} className="block text-xs leading-4 text-gray-muted">
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
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : ariaInvalid}
          rows={2}
          className={cn(BASE, "min-h-12 resize-none leading-6 overflow-hidden", error && "border-terra focus:border-terra focus-visible:ring-terra/40", className)}
          onChange={(e) => {
            onChange?.(e);
            autoResize();
          }}
          {...rest}
        />
        {errorId && <FieldMessage id={errorId} error>{error}</FieldMessage>}
        {helperId && <FieldMessage id={helperId}>{helperText}</FieldMessage>}
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
  helperText?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ label, options, error, helperText, className, id: idProp, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...rest }, ref) => {
    const autoId = useId();
    const id = idProp || autoId;
    const { helperId, errorId } = fieldIds(id, helperText, error);
    const describedBy = mergeDescribedBy(ariaDescribedBy, helperId, errorId);
    return (
      <div className="grid gap-1">
        {label && (
          <label htmlFor={id} className="block text-xs leading-4 text-gray-muted">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : ariaInvalid}
          className={cn(BASE, "appearance-none", error && "border-terra focus:border-terra focus-visible:ring-terra/40", className)}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errorId && <FieldMessage id={errorId} error>{error}</FieldMessage>}
        {helperId && <FieldMessage id={helperId}>{helperText}</FieldMessage>}
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
    <label htmlFor={htmlFor} className="block text-xs leading-4 text-gray-muted">
      {children}
    </label>
  );
}
