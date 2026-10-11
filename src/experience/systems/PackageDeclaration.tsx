import type { z } from "zod";
import type { packageDeclarationSchema } from "@/platform/system-versions/declaration";

// Prepared by the names lane; this component is shared by source and recipient.
import { packageDeclarationLabel } from "@/platform/presentation/package-declaration";
export const declarationValue = packageDeclarationLabel;
export function PackageDeclaration({ declaration }: { declaration: z.infer<typeof packageDeclarationSchema> }) {
  return <dl className="grid gap-3 text-sm sm:grid-cols-2">{([
    ["Reads records", declaration.recordsRead], ["Writes records", declaration.recordsWritten],
    ["Business information", declaration.businessRecordFields], ["Outside actions", declaration.outsideEffects],
    ["Required accounts", declaration.bindingKinds], ["Data leaving your business", declaration.dataLeavingBusiness],
  ] as const).map(([label, values]) => <div key={label} className="min-w-0"><dt className="text-gray-muted">{label}</dt><dd className="mt-1 break-words">{values.map(declarationValue).join(", ") || "None"}</dd></div>)}</dl>;
}
