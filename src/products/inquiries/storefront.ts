import type { InquiryCapabilityState } from "./contracts";
import { isPublicInquiryForm, type PublicInquiryForm } from "../../../custom-repo-starter/inquiry-client";

/** Public projection deliberately excludes routing destinations, policies, and records. */
export function projectPublishedInquiry(capability: InquiryCapabilityState): PublicInquiryForm | null {
  const definition = capability.live;
  if (!definition || !["live", "live_unverified"].includes(capability.status)) return null;
  if (definition.businessId !== capability.businessId || definition.id !== capability.id) return null;
  const projection: PublicInquiryForm = {
    schemaVersion: 1,
    capabilityId: capability.id,
    version: definition.version,
    name: definition.name,
    form: {
      component: definition.form.component,
      id: definition.form.id,
      title: definition.form.title,
      intro: definition.form.intro,
      disclosure: definition.form.disclosure,
      fields: definition.form.fields.map((field) => ({
        id: field.id,
        label: field.label,
        kind: field.kind,
        component: field.component,
        required: field.required,
        ...(field.placeholder !== undefined ? { placeholder: field.placeholder } : {}),
        ...(field.options !== undefined ? { options: [...field.options] } : {}),
      })),
    },
  };
  return isPublicInquiryForm(projection) ? projection : null;
}
