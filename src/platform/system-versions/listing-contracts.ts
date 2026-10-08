import { z } from "zod";
import { packageDeclarationSchema, revisionQualificationSchema } from "./declaration";
const uuid = z.string().uuid();
export const packageListingSchema = z.object({
  name: z.string().min(1).max(160), creatorName: z.string().min(1),
  source: z.object({ source: z.object({ businessId: uuid, systemId: uuid }), listingState: z.enum(["private", "clients", "listed"]), creatorWorkspaceId: uuid }).passthrough(),
  revision: z.object({ source: z.object({ businessId: uuid, systemId: uuid, revisionId: uuid, number: z.number().int().positive() }), definition: z.record(z.string(), z.json()), summary: z.string(), declaration: packageDeclarationSchema, qualification: revisionQualificationSchema }).passthrough(),
}).strict();
export type PackageListing = z.infer<typeof packageListingSchema>;
export const packageCatalogSchema = z.object({ workspaceId: uuid, listings: z.array(packageListingSchema).max(500) }).strict();
export const packageCreatorSchema = z.object({ creatorWorkspaceId: uuid, creatorName: z.string().min(1), sourceRevisionId: uuid }).strict();
