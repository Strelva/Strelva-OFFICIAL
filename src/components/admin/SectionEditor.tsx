"use client";

import { useEffect, useRef, useCallback } from "react";
import { SaveButton } from "./SaveButton";

interface SectionEditorProps {
  title: string;
  description?: string;
  siteAnchor?: string;
  onSave: () => Promise<void>;
  children: React.ReactNode;
}

export function SectionEditor({ title, description, siteAnchor, onSave, children }: SectionEditorProps) {
  const dirty = useRef(false);
  const savedOnce = useRef(false);

  const handleChange = useCallback(() => {
    if (savedOnce.current || dirty.current) return;
    dirty.current = true;
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const wrappedSave = async () => {
    await onSave();
    dirty.current = false;
    savedOnce.current = true;
  };

  const viewUrl = siteAnchor ? `/#${siteAnchor}` : "/";

  return (
    <div onInput={handleChange}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-2xl" style={{ color: "var(--bark)" }}>{title}</h1>
          {description && (
            <p className="mt-1 text-sm" style={{ color: "var(--bark-faded)" }}>{description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
            style={{ color: "var(--bark-faded)", border: "1px solid var(--cream-dark)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--cream-dark)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            View on Site
          </a>
          <SaveButton onClick={wrappedSave} />
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
