/** Portable public inquiry contract. Copy with StrelvaInquiryForm into client sites. */
export interface PublicInquiryField {
  id: string;
  label: string;
  kind: "text" | "email" | "phone" | "date" | "textarea" | "select";
  component: "text_field" | "email_field" | "phone_field" | "date_field" | "textarea_field" | "select_field";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface PublicInquiryForm {
  schemaVersion: 1;
  capabilityId: string;
  version: number;
  name: string;
  form: {
    component: "form";
    id: string;
    title: string;
    intro: string;
    fields: PublicInquiryField[];
    disclosure: "Strelva";
  };
}

const FIELD_COMPONENTS: Record<PublicInquiryField["kind"], PublicInquiryField["component"]> = {
  text: "text_field", email: "email_field", phone: "phone_field", date: "date_field", textarea: "textarea_field", select: "select_field",
};

export function isPublicInquiryForm(value: unknown): value is PublicInquiryForm {
  if (!value || typeof value !== "object") return false;
  const item = value as PublicInquiryForm;
  if (item.schemaVersion !== 1 || typeof item.capabilityId !== "string" || !item.capabilityId ||
    !Number.isSafeInteger(item.version) || item.version < 1 || typeof item.name !== "string") return false;
  const form = item.form;
  if (!form || form.component !== "form" || form.disclosure !== "Strelva" ||
    typeof form.id !== "string" || typeof form.title !== "string" || typeof form.intro !== "string" ||
    !Array.isArray(form.fields) || form.fields.length === 0 || form.fields.length > 30) return false;
  const ids = new Set<string>();
  return form.fields.every((field) => {
    if (!field || typeof field !== "object" || typeof field.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(field.id) || ["__proto__", "constructor", "prototype"].includes(field.id) || ids.has(field.id)) return false;
    ids.add(field.id);
    return typeof field.label === "string" && field.label.length <= 200 && typeof field.required === "boolean" &&
      Object.hasOwn(FIELD_COMPONENTS, field.kind) && FIELD_COMPONENTS[field.kind] === field.component &&
      (field.placeholder === undefined || typeof field.placeholder === "string") &&
      (field.kind !== "select" || (Array.isArray(field.options) && field.options.length > 0 && field.options.length <= 100 && field.options.every((option) => typeof option === "string")));
  });
}

function endpoint(baseUrl: string, tenant: string, resource: string): string {
  if (!/^[a-z0-9-]+$/.test(tenant)) throw new Error("Invalid business identifier.");
  return `${baseUrl.replace(/\/$/, "")}/api/v1/${resource}/${encodeURIComponent(tenant)}`;
}

export async function loadInquiryForm(baseUrl: string, tenant: string, capabilityId: string, signal?: AbortSignal): Promise<PublicInquiryForm> {
  const response = await fetch(`${endpoint(baseUrl, tenant, "inquiries")}?capabilityId=${encodeURIComponent(capabilityId)}`, { credentials: "omit", cache: "no-store", signal });
  if (!response.ok) throw new Error("This inquiry form is unavailable. Please contact the business directly.");
  const body: unknown = await response.json();
  if (!isPublicInquiryForm(body)) throw new Error("This inquiry form could not be loaded.");
  return body;
}

export async function submitInquiryForm(baseUrl: string, tenant: string, definition: PublicInquiryForm, fields: Record<string, string>): Promise<void> {
  const response = await fetch(endpoint(baseUrl, tenant, "leads"), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      capabilityId: definition.capabilityId,
      capabilityVersion: definition.version,
      fields,
      name: fields.name,
      email: fields.email,
      message: fields.message ?? fields.request,
      source: "inquiry-capability",
    }),
  });
  if (!response.ok) throw new Error(response.status === 409 ? "This form changed. Reload it before sending your request." : "Your request was not confirmed. Please try again.");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) throw new Error("Your request was not confirmed. Please try again.");
}
