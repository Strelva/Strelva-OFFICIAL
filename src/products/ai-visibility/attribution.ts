import type { AiVisibilityResult } from "./contracts";
import { providerNeutralCopy, type AgencyAttribution } from "@/platform/infra/agency-attribution";

export function attributedAiVisibility(result: AiVisibilityResult, agency?: AgencyAttribution): AiVisibilityResult {
  if (!agency) return result;
  return { ...result, agency, topFix: providerNeutralCopy(result.topFix),
    verdict: providerNeutralCopy(result.verdict),
    signals: result.signals.map(signal => ({ ...signal, detail: providerNeutralCopy(signal.detail) })),
  };
}
