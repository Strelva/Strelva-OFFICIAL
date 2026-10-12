import {z} from "zod";
const uuid=z.string().uuid();
export const nativeVersionPreparationReceiptSchema=z.object({kind:z.literal("native"),receiptId:uuid,workspaceId:uuid,versionId:uuid,rowRevision:z.number().int().positive(),workId:uuid,reviewHref:z.string().regex(/^\/workspace\?/),status:z.enum(["awaiting_native_review","verified"])}).strict();
export const versionPreparationResultReceiptSchema=z.union([nativeVersionPreparationReceiptSchema,z.object({receiptId:uuid,decisionId:uuid,workspaceId:uuid,versionId:uuid,rowRevision:z.number().int().positive()}).strict()]);

export const nativeVersionConflictSchema=z.object({kind:z.literal("native_conflict"),workspaceId:uuid,versionId:uuid,rowRevision:z.number().int().positive(),nativeKind:z.enum(["inquiry_pattern","website_section"]),conflicts:z.array(z.object({path:z.string().min(1),local:z.unknown(),source:z.unknown()}).strict()).min(1)}).strict();
export const nativeVersionResolutionSchema=z.object({path:z.string().min(1).max(300),choice:z.enum(["local","source"])}).strict();
export type NativeVersionResolution=z.infer<typeof nativeVersionResolutionSchema>;
