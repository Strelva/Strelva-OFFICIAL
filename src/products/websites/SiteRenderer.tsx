import type { TenantBusinessContext } from "@/platform/business-record/public-reader";
import { siteWithBusinessRecord } from "./business-record";
import { createElement, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { siteDocumentSchema, siteDocumentHash, type SiteDocument } from "./site-document";
import { SITE_CATALOG_CSS, sitePageTree, siteThemeVariables, type SiteTree } from "./site-render-tree";
import { SiteCapability } from "./SiteCapability";
import { safeJsonLd, siteFaqJsonLd } from "./site-seo";
import { SiteLeadForm } from "./SiteLeadForm";
import { projectWebsiteBusinessFacts, type WebsiteBusinessFacts } from "./business-facts";

export interface SiteRendererProps {
  document: SiteDocument;
  path?: string;
  preview?: boolean;
  tenant?: string;
  contentHash?: string;
  businessContext?: TenantBusinessContext | null;
  /** Serve visitor tools under this current tenant slug (after a rename). The
   * page still emits the issued document's hash. */
  capabilityTenant?: string;
  businessFacts?: WebsiteBusinessFacts | null;
}

/** Dependency-free catalog renderer behind the replaceable SiteRenderer boundary. */
export function SiteRenderer({ document: input, path = "/", preview = false, tenant, contentHash, capabilityTenant, businessFacts, businessContext }: SiteRendererProps) {
  const issued = siteDocumentSchema.parse(input);
  const documentHash = siteDocumentHash(issued);
  // A document bound to the record uses its typed projection (approved copy when
  // unavailable); an unbound document takes the released record overlay.
  const projected = preview ? issued : issued.businessRecord ? projectWebsiteBusinessFacts(issued, businessFacts ?? null) : siteWithBusinessRecord(issued, businessContext ?? null);
  const document = capabilityTenant && projected.capabilities && capabilityTenant === tenant ? { ...projected, capabilities: { ...projected.capabilities, tenant: capabilityTenant } } : projected;
  const faqSchema = preview ? null : siteFaqJsonLd(document, path);
  if (contentHash && contentHash !== documentHash) throw new Error("The rendered website document does not match its approved hash.");
  const render = (tree: SiteTree, key: string): ReactNode => {
    if (typeof tree === "string") return tree;
    const { class: className, for: htmlFor, tabindex: tabIndex, ...attrs } = tree.attrs;
    const props = { ...attrs, ...(className ? { className } : {}), ...(htmlFor ? { htmlFor } : {}), ...(tabIndex !== undefined ? { tabIndex } : {}), key };
    if (tree.tag === "img") {
      // Only assets that passed the document's rehosted-media validation arrive here.
      return <Image key={key} src={String(attrs.src)} alt={String(attrs.alt ?? "")} width={Number(attrs.width)} height={Number(attrs.height)} sizes="(max-width: 768px) 100vw, 50vw" className={String(className ?? "")} unoptimized={String(attrs.src).startsWith("/media/")} />;
    }
    if (attrs["data-site-inquiry"] && tenant) return <SiteLeadForm key={key} tenant={tenant} />;
    if (attrs["data-strelva-capability"] && document.capabilities) return <SiteCapability key={key} kind={attrs["data-strelva-capability"] as "inquiry" | "booking"} config={document.capabilities} />;
    return createElement(tree.tag, props, ...tree.children.map((child, index) => render(child, `${key}-${index}`)));
  };
  return <div style={siteThemeVariables(document) as CSSProperties} data-site-document-hash={documentHash}>
    <meta name="strelva-site-hash" content={documentHash} />
    {businessFacts && projected !== issued && !preview ? <meta name="strelva-business-record-revision" content={String(businessFacts.revision)} /> : null}
    <style>{SITE_CATALOG_CSS}</style>
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }} />}
    {render(sitePageTree(document, path, { preview, tenant }), "site")}
  </div>;
}
