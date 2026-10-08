import type { AuditResult } from "./types";
import { providerNeutralCopy, type AgencyAttribution } from "@/platform/infra/agency-attribution";

export function attributedAudit(result: AuditResult, agency?: AgencyAttribution): AuditResult {
  if (!agency) return result;
  return { ...result, agency, categories: result.categories.map(category => ({ ...category,
    checks: category.checks.map(check => ({ ...check,
      message: providerNeutralCopy(check.message),
      ...(check.details ? { details: providerNeutralCopy(check.details) } : {}),
      ...(check.impact ? { impact: providerNeutralCopy(check.impact) } : {}),
    })),
  })) };
}

