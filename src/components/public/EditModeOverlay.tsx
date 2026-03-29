"use client";

import { useEffect, useState, useCallback } from "react";

export function EditModeOverlay() {
  const [editMode, setEditMode] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [labelPos, setLabelPos] = useState<{ top: number; left: number } | null>(null);

  // Detect edit mode from URL or postMessage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "true") setEditMode(true);

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "reb-edit-mode") {
        setEditMode(event.data.enabled);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Set up section hover/click listeners
  useEffect(() => {
    if (!editMode) return;

    // Set data attribute on html for CSS targeting
    document.documentElement.setAttribute("data-reb-edit", "true");

    const sections = document.querySelectorAll("[data-reb-section]");

    function handleMouseEnter(e: Event) {
      const el = e.currentTarget as HTMLElement;
      const sectionType = el.getAttribute("data-reb-section");
      setHoveredSection(sectionType);
      // Position label
      const rect = el.getBoundingClientRect();
      setLabelPos({ top: rect.top + window.scrollY, left: rect.left });
      window.parent.postMessage({ type: "reb-section-hovered", section: sectionType }, "*");
    }

    function handleMouseLeave() {
      setHoveredSection(null);
      setLabelPos(null);
      window.parent.postMessage({ type: "reb-section-hovered", section: null }, "*");
    }

    function handleClick(e: Event) {
      const el = (e.currentTarget as HTMLElement);
      const sectionType = el.getAttribute("data-reb-section");
      const editable = el.getAttribute("data-reb-editable");
      if (sectionType) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({
          type: "reb-section-clicked",
          section: editable || sectionType,
        }, "*");
      }
    }

    sections.forEach((section) => {
      (section as HTMLElement).addEventListener("mouseenter", handleMouseEnter);
      (section as HTMLElement).addEventListener("mouseleave", handleMouseLeave);
      (section as HTMLElement).addEventListener("click", handleClick, true);
    });

    return () => {
      document.documentElement.removeAttribute("data-reb-edit");
      sections.forEach((section) => {
        (section as HTMLElement).removeEventListener("mouseenter", handleMouseEnter);
        (section as HTMLElement).removeEventListener("mouseleave", handleMouseLeave);
        (section as HTMLElement).removeEventListener("click", handleClick, true);
      });
    };
  }, [editMode]);

  // Set up inline text editing
  useEffect(() => {
    if (!editMode) return;

    const fields = document.querySelectorAll("[data-reb-section] [data-reb-field]");

    function handleFocus(e: Event) {
      const el = e.target as HTMLElement;
      el.style.outline = "2px solid var(--sage)";
      el.style.outlineOffset = "2px";
      el.style.borderRadius = "2px";
    }

    function handleBlur(e: Event) {
      const el = e.target as HTMLElement;
      el.style.outline = "";
      el.style.outlineOffset = "";
      el.style.borderRadius = "";

      const sectionEl = el.closest("[data-reb-section]");
      const section = sectionEl?.getAttribute("data-reb-editable") || sectionEl?.getAttribute("data-reb-section");
      const field = el.getAttribute("data-reb-field");
      const value = el.textContent || "";

      if (section && field) {
        window.parent.postMessage({
          type: "reb-inline-edit",
          section,
          field,
          value,
        }, "*");
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    }

    fields.forEach((field) => {
      const el = field as HTMLElement;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.style.cursor = "text";
      el.addEventListener("focus", handleFocus);
      el.addEventListener("blur", handleBlur);
      el.addEventListener("keydown", handleKeyDown as EventListener);
    });

    return () => {
      fields.forEach((field) => {
        const el = field as HTMLElement;
        el.removeAttribute("contenteditable");
        el.removeAttribute("spellcheck");
        el.style.cursor = "";
        el.removeEventListener("focus", handleFocus);
        el.removeEventListener("blur", handleBlur);
        el.removeEventListener("keydown", handleKeyDown as EventListener);
      });
    };
  }, [editMode]);

  if (!editMode) return null;

  // Floating section label
  const label = hoveredSection
    ? document.querySelector(`[data-reb-section="${hoveredSection}"]`)?.getAttribute("data-reb-label") || hoveredSection
    : null;

  return (
    <>
      {label && labelPos && (
        <div
          className="reb-section-label"
          style={{
            position: "absolute",
            top: labelPos.top,
            left: labelPos.left,
            zIndex: 9999,
          }}
        >
          {label}
        </div>
      )}
    </>
  );
}
