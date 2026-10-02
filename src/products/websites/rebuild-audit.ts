import { load } from "cheerio";
import { computeVisibleText } from "@/lib/audit/checks";
import type { AuditContext } from "@/lib/audit/context";
import { checkAiReadability } from "@/lib/audit/modules/ai-readability";
import { checkSeoFoundations } from "@/lib/audit/modules/seo-foundations";
import { checkAccessibility } from "@/lib/audit/modules/accessibility";
import { checkTrust } from "@/lib/audit/modules/trust";
import { checkContent } from "@/lib/audit/modules/content";
import { rebuildAuditSnapshotSchema, type RebuildAuditSnapshot } from "./rebuild-audit-contracts";

/** Existing canonical audit modules, limited to evidence actually in the HTML.
 * Missing response headers, performance and well-known files are unmeasured.
 */
export function auditRebuildHtml(html: string, url: string): RebuildAuditSnapshot {
  const $ = load(html);
  const context: AuditContext = { html,$,url,visibleText:computeVisibleText($),fetchOk:true,headers:new Headers(),robotsTxt:null,sitemapXml:null,llmsTxt:null };
  const categories = [checkAiReadability(context,{ htmlOnly:true }),checkSeoFoundations(context,{ htmlOnly:true }),checkAccessibility(context),checkTrust(context),checkContent(context)].map(category => {
    const checks = category.checks.map(({ name,status,score,message }) => ({ name,status,score,message }));
    return { name: category.name, slug: category.slug, score: category.score, checks };
  });
  return rebuildAuditSnapshotSchema.parse({ categories });
}
