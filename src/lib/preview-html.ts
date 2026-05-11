export function normalizePreviewPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function injectBaseHref(html: string, href: string): string {
  const base = `<base href="${href}">`;
  if (/<base\s/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
}

export function removeExecutableScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "");
}

const EDIT_BRIDGE = String.raw`
<style id="reb-edit-preview-style">
  html[data-reb-edit="true"] [data-reb-section] {
    cursor: pointer;
    outline: 2px solid transparent;
    outline-offset: -2px;
    transition: outline-color 120ms ease;
  }
  html[data-reb-edit="true"] [data-reb-section]:hover {
    outline-color: rgba(96, 165, 250, 0.75);
  }
  html[data-reb-edit="true"] .reb-highlighted {
    outline: 2px solid rgba(96, 165, 250, 0.95) !important;
    outline-offset: -2px;
  }
  .reb-edit-label {
    position: absolute;
    z-index: 2147483647;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.92);
    color: white;
    padding: 4px 8px;
    font: 700 10px/1.2 system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
  }
</style>
<script id="reb-edit-preview-bridge">
(() => {
  document.documentElement.setAttribute("data-reb-edit", "true");
  const post = (message) => {
    try { window.parent.postMessage(message, "*"); } catch {}
  };
  const bySection = (section) =>
    document.querySelector('[data-reb-section="' + CSS.escape(section) + '"]') ||
    document.querySelector('[data-reb-editable="' + CSS.escape(section) + '"]');
  const getNodeType = (el) => {
    const tag = el.tagName.toLowerCase();
    const field = el.getAttribute("data-reb-field") || "";
    if (tag === "img" || field.toLowerCase().includes("image")) return "image";
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    return "text";
  };
  const canInlineEdit = (el) => getNodeType(el) === "text" && !el.closest("a, button");
  const sectionFor = (el) => {
    const sectionEl = el.closest("[data-reb-section]");
    return sectionEl?.getAttribute("data-reb-editable") || sectionEl?.getAttribute("data-reb-section");
  };
  const label = document.createElement("div");
  label.className = "reb-edit-label";
  label.hidden = true;
  document.body.appendChild(label);

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data.type !== "string" || !data.type.startsWith("reb-")) return;
    if (data.type === "reb-highlight-section") {
      document.querySelectorAll(".reb-highlighted").forEach((el) => el.classList.remove("reb-highlighted"));
      if (!data.section) return;
      const target = bySection(data.section);
      if (target) {
        target.classList.add("reb-highlighted");
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    if (data.type === "reb-scroll-to" && data.section) {
      bySection(data.section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (data.type === "reb-request-rect" && data.section) {
      const target = bySection(data.section);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      post({
        type: "reb-node-rect",
        section: data.section,
        rect: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      });
    }
  });

  document.querySelectorAll("[data-reb-section]").forEach((sectionEl) => {
    sectionEl.addEventListener("mouseenter", () => {
      const section = sectionEl.getAttribute("data-reb-section");
      const text = sectionEl.getAttribute("data-reb-label") || section;
      const rect = sectionEl.getBoundingClientRect();
      label.textContent = text || "";
      label.style.top = rect.top + window.scrollY + "px";
      label.style.left = rect.left + "px";
      label.hidden = !text;
      post({ type: "reb-section-hovered", section });
    });
    sectionEl.addEventListener("mouseleave", () => {
      label.hidden = true;
      post({ type: "reb-section-hovered", section: null });
    });
    sectionEl.addEventListener("click", (event) => {
      if (event.target.closest("[data-reb-field]")) return;
      const section = sectionEl.getAttribute("data-reb-editable") || sectionEl.getAttribute("data-reb-section");
      if (!section) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = sectionEl.getBoundingClientRect();
      post({
        type: "reb-node-selected",
        section,
        label: sectionEl.getAttribute("data-reb-label") || section,
        nodeType: "section",
        rect: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      });
      post({ type: "reb-section-clicked", section });
    }, true);
    sectionEl.addEventListener("contextmenu", (event) => {
      const section = sectionEl.getAttribute("data-reb-editable") || sectionEl.getAttribute("data-reb-section");
      if (!section) return;
      event.preventDefault();
      event.stopPropagation();
      post({
        type: "reb-context-menu",
        section,
        label: sectionEl.getAttribute("data-reb-label") || section,
        x: event.clientX,
        y: event.clientY,
      });
    }, true);
  });

  document.querySelectorAll("[data-reb-section] [data-reb-field]").forEach((fieldEl) => {
    if (canInlineEdit(fieldEl)) {
      fieldEl.setAttribute("contenteditable", "true");
      fieldEl.setAttribute("spellcheck", "false");
      fieldEl.style.cursor = "text";
      fieldEl.addEventListener("focus", () => {
        fieldEl.style.outline = "2px solid rgba(96, 165, 250, 0.95)";
        fieldEl.style.outlineOffset = "2px";
      });
      fieldEl.addEventListener("blur", () => {
        fieldEl.style.outline = "";
        fieldEl.style.outlineOffset = "";
        const section = sectionFor(fieldEl);
        const field = fieldEl.getAttribute("data-reb-field");
        if (section && field) {
          post({ type: "reb-inline-edit", section, field, value: fieldEl.textContent || "" });
        }
      });
      fieldEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          fieldEl.blur();
        }
      });
    } else {
      fieldEl.style.cursor = "pointer";
    }
    fieldEl.addEventListener("click", (event) => {
      const section = sectionFor(fieldEl);
      const field = fieldEl.getAttribute("data-reb-field");
      if (!section || !field) return;
      if (getNodeType(fieldEl) !== "text") event.preventDefault();
      event.stopPropagation();
      const rect = fieldEl.getBoundingClientRect();
      post({
        type: "reb-node-selected",
        section,
        field,
        label: fieldEl.getAttribute("data-reb-label") || field,
        nodeType: getNodeType(fieldEl),
        rect: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      });
    }, true);
  });
})();
</script>`;

export function injectEditBridge(html: string): string {
  if (html.includes('id="reb-edit-preview-bridge"')) return html;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${EDIT_BRIDGE}</body>`);
  return `${html}${EDIT_BRIDGE}`;
}

export function prepareLivePreviewHtml(html: string, baseHref: string): string {
  return removeExecutableScripts(injectBaseHref(html, baseHref));
}

export function prepareEditablePreviewHtml(html: string, baseHref: string): string {
  return injectEditBridge(prepareLivePreviewHtml(html, baseHref));
}
