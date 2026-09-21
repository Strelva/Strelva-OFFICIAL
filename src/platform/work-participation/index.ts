import { createParticipationService } from "./service";
import { postgresWorkAuthority } from "../work-context/repository";
const service = createParticipationService(postgresWorkAuthority);
export const inspectWorkParticipation = service.inspect;
export const readWorkParticipation = service.read;
export const changeWorkParticipation = service.change;
export const readContributionTarget = service.readTarget;
export { participationCommandSchema, participationSchema } from "./service";
export type { WorkParticipation } from "./service";
export {
  createOperationalAssignmentService,
  operationalAssigneeKindSchema,
  operationalAssignmentOfferSchema,
  operationalAssignmentSchema,
  operationalAssignmentStatusSchema,
} from "./assignments";
export type {
  AssignedResponsibility,
  OperationalAssignment,
  OperationalAssignmentOffer,
  OperationalAssignmentStore,
} from "./assignments";
export { postgresOperationalAssignments } from "./assignment-repository";
