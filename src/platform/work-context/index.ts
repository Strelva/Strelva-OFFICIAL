import { createContextService } from "./service";
import { postgresWorkAuthority } from "./repository";
const service = createContextService(postgresWorkAuthority);
export const readWorkContext = service.read;
export const changeWorkContext = service.change;
export const requireWorkSourceGrant = service.requireSource;
export { contextCommandSchema, workContextSchema } from "./service";
export type { WorkContext, WorkContextView } from "./service";
export {
  ContextSourceIsolationError,
  SAFE_CONTEXT_LIMITS,
  isSensitiveContextFieldName,
  prepareContextEvidence,
  prepareContextFact,
  prepareContextPayload,
  prepareContextProvenance,
  prepareContextText,
} from "./preparation";
export type {
  ContextSourceProvenance,
  PreparedContextEvidence,
  PreparedContextSourceProvenance,
} from "./preparation";
