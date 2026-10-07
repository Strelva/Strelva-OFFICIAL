"use client";

import { createElement, useState, type CSSProperties, type ReactNode, type MouseEvent } from "react";
import { siteDocumentSchema, type SiteDocument } from "./site-document-schema";
import { SITE_CATALOG_CSS, sitePageTree, siteThemeVariables, type SiteTree } from "./site-render-tree";

/** Native catalog, with internal navigation confined to this candidate. No provider callbacks. */
export function SiteDocumentTry({ document: raw }: { document: SiteDocument }) {
  const document = siteDocumentSchema.parse(raw);
  const [path, setPath] = useState("/");
  const render = (tree: SiteTree, key: string): ReactNode => {
    if (typeof tree === "string") return tree;
    const { class: className, for: htmlFor, tabindex: tabIndex, ...attrs } = tree.attrs;
    return createElement(tree.tag, { ...attrs, className, htmlFor, tabIndex, key }, ...tree.children.map((child, index) => render(child, `${key}-${index}`)));
  };
  function navigate(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const next = link.getAttribute("href");
    if (document.pages.some(page => page.path === next)) setPath(next!);
  }
  return <section aria-label="Working website candidate" onClick={navigate} style={siteThemeVariables(document) as CSSProperties}>
    <p className="mb-3 text-xs text-gray-muted" role="status">Preview page: {path}. Links stay inside this test.</p>
    <style>{SITE_CATALOG_CSS}</style>
    {render(sitePageTree(document, path, { preview: true }), path)}
  </section>;
}
