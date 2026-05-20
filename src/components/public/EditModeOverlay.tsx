"use client";

import { useEffect, useState } from "react";

export function EditModeOverlay() {
  const [editMode, setEditMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("edit") === "true";
  });
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [labelPos, setLabelPos] = useState<{ top: number; left: number } | null>(null);

  // Listen for dashboard-driven edit mode toggles
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "reb-edit-mode") {
        setEditMode(event.data.enabled);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Handle highlight-section messages from dashboard
  useEffect(() => {
    if (!editMode) return;

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "reb-highlight-section") {
        // Remove previous highlight
        document.querySelectorAll(".reb-highlighted").forEach((el) => {
          el.classList.remove("reb-highlighted");
        });
        // Apply new highlight
        if (event.data.section) {
          const target =
            document.querySelector(`[data-reb-section="${event.data.section}"]`) ||
            document.querySelector(`[data-reb-editable="${event.data.section}"]`);
          if (target) {
            target.classList.add("reb-highlighted");
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }

      // Handle rect request from parent
      if (event.data?.type === "reb-request-rect") {
        const section = event.data.section;
        const el = document.querySelector(`[data-reb-section="${section}"]`) ||
                   document.querySelector(`[data-reb-editable="${section}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          window.parent.postMessage({
            type: "reb-node-rect",
            section,
            rect: {
              top: rect.top + window.scrollY,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          }, "*");
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [editMode]);

  // Set up section hover/click/contextmenu listeners
  useEffect(() => {
    if (!editMode) return;

    document.documentElement.setAttribute("data-reb-edit", "true");
    const sections = document.querySelectorAll("[data-reb-section]");

    function handleMouseEnter(e: Event) {
      const el = e.currentTarget as HTMLElement;
      const sectionType = el.getAttribute("data-reb-section");
      setHoveredSection(sectionType);
      const rect = el.getBoundingClientRect();
      setLabelPos({ top: rect.top + window.scrollY, left: rect.left });
      window.parent.postMessage({
        type: "reb-section-hovered",
        section: sectionType,
        rect: {
          top: rect.top + window.scrollY,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      }, "*");
    }

    function handleMouseLeave() {
      setHoveredSection(null);
      setLabelPos(null);
      window.parent.postMessage({ type: "reb-section-hovered", section: null }, "*");
    }

    function handleClick(e: Event) {
      if ((e.target as HTMLElement).closest("[data-reb-field]")) {
        return;
      }
      const el = (e.currentTarget as HTMLElement);
      const sectionType = el.getAttribute("data-reb-section");
      const editable = el.getAttribute("data-reb-editable");
      const label = el.getAttribute("data-reb-label") || sectionType;

      if (sectionType) {
        e.preventDefault();
        e.stopPropagation();

        const rect = el.getBoundingClientRect();

        // Send enhanced message with DOM rect
        window.parent.postMessage({
          type: "reb-node-selected",
          section: editable || sectionType,
          label,
          nodeType: "section",
          rect: {
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        }, "*");

        // Also send legacy message for backwards compat
        window.parent.postMessage({
          type: "reb-section-clicked",
          section: editable || sectionType,
        }, "*");
      }
    }

    function handleContextMenu(e: Event) {
      const me = e as MouseEvent;
      const el = (me.currentTarget as HTMLElement);
      const sectionType = el.getAttribute("data-reb-section");
      const editable = el.getAttribute("data-reb-editable");
      const label = el.getAttribute("data-reb-label") || sectionType;
      if (sectionType) {
        me.preventDefault();
        me.stopPropagation();
        // Send position relative to viewport so parent can position the menu
        window.parent.postMessage({
          type: "reb-context-menu",
          section: editable || sectionType,
          label,
          x: me.clientX,
          y: me.clientY,
        }, "*");
      }
    }

    sections.forEach((section) => {
      (section as HTMLElement).addEventListener("mouseenter", handleMouseEnter);
      (section as HTMLElement).addEventListener("mouseleave", handleMouseLeave);
      (section as HTMLElement).addEventListener("click", handleClick, true);
      (section as HTMLElement).addEventListener("contextmenu", handleContextMenu, true);
    });

    return () => {
      document.documentElement.removeAttribute("data-reb-edit");
      sections.forEach((section) => {
        (section as HTMLElement).removeEventListener("mouseenter", handleMouseEnter);
        (section as HTMLElement).removeEventListener("mouseleave", handleMouseLeave);
        (section as HTMLElement).removeEventListener("click", handleClick, true);
        (section as HTMLElement).removeEventListener("contextmenu", handleContextMenu, true);
      });
    };
  }, [editMode]);

  // Set up inline text editing
  useEffect(() => {
    if (!editMode) return;

    const fields = document.querySelectorAll("[data-reb-section] [data-reb-field]");

    function getNodeType(el: HTMLElement) {
      const tag = el.tagName.toLowerCase();
      const field = el.getAttribute("data-reb-field") || "";
      if (tag === "img" || field.toLowerCase().includes("image")) return "image";
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      return "text";
    }

    function canInlineEdit(el: HTMLElement) {
      const type = getNodeType(el);
      return type === "text" && !el.closest("a, button");
    }

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
      if (!field || !canInlineEdit(el)) return;
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
      if (e.key === "Escape") {
        (e.target as HTMLElement).blur();
      }
    }

    // Handle field clicks to send node-selected with field info
    function handleFieldClick(e: Event) {
      const el = e.currentTarget as HTMLElement;
      const field = el.getAttribute("data-reb-field");
      const sectionEl = el.closest("[data-reb-section]");
      const section = sectionEl?.getAttribute("data-reb-editable") || sectionEl?.getAttribute("data-reb-section");
      const label = el.getAttribute("data-reb-label") || field;
      const nodeType = getNodeType(el);

      if (section && field) {
        if (nodeType !== "text") {
          e.preventDefault();
        }
        e.stopPropagation();

        const rect = el.getBoundingClientRect();

        window.parent.postMessage({
          type: "reb-node-selected",
          section,
          field,
          label,
          nodeType,
          rect: {
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        }, "*");
      }
    }

    fields.forEach((field) => {
      const el = field as HTMLElement;
      if (canInlineEdit(el)) {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
        el.style.cursor = "text";
        el.addEventListener("focus", handleFocus);
        el.addEventListener("blur", handleBlur);
        el.addEventListener("keydown", handleKeyDown as EventListener);
      } else {
        el.style.cursor = "pointer";
      }
      el.addEventListener("click", handleFieldClick, true);
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
        el.removeEventListener("click", handleFieldClick, true);
      });
    };
  }, [editMode]);

  if (!editMode) return null;

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
