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

/** Signed booking page with up to three suggested times (bookings `STRELVA_BOOKING_INQUIRY_OFFERS`). */
export interface PublicInquiryBookingOffer { serviceName: string; timeZone: string; url: string; slots: Array<{ start: string; end: string }> }
/** One signed link per suggested time (inquiries `STRELVA_INQUIRY_BOOKING_HANDOFF`). */
export interface PublicInquiryBookingChoices { serviceName: string; slots: Array<{ label: string; chooseUrl: string }> }
export interface InquirySubmissionReceipt { bookingOffer?: PublicInquiryBookingOffer | PublicInquiryBookingChoices }

/** Old consumers can ignore the result; only a signed booking page offer is returned here. */
export async function submitInquiryForm(baseUrl: string, tenant: string, definition: PublicInquiryForm, fields: Record<string, string>): Promise<PublicInquiryBookingOffer | void> {
  const { bookingOffer } = await submitInquiryFormWithReceipt(baseUrl, tenant, definition, fields);
  if (bookingOffer && isInquiryBookingOffer(bookingOffer)) return bookingOffer;
}

export async function submitInquiryFormWithReceipt(baseUrl: string, tenant: string, definition: PublicInquiryForm, fields: Record<string, string>): Promise<InquirySubmissionReceipt> {
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
  const receipt: InquirySubmissionReceipt = {};
  if (!("bookingOffer" in result) || !result.bookingOffer || typeof result.bookingOffer !== "object") return receipt;
  if (isInquiryBookingOffer(result.bookingOffer)) return { bookingOffer: result.bookingOffer };
  const offer = result.bookingOffer as Record<string, unknown>;
  if (typeof offer.serviceName !== "string" || offer.serviceName.length > 160 || !Array.isArray(offer.slots) || offer.slots.length < 1 || offer.slots.length > 3) return receipt;
  const slots: PublicInquiryBookingChoices["slots"] = [];
  for (const item of offer.slots) {
    if (!item || typeof item !== "object" || typeof item.label !== "string" || item.label.length > 200 || typeof item.chooseUrl !== "string"
      || !/^\/inquiry-booking\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\?slot=[0-2]$/.test(item.chooseUrl)) return receipt;
    const link = new URL(item.chooseUrl, baseUrl);
    if (link.protocol !== "https:" && link.protocol !== "http:") return receipt;
    slots.push({ label: item.label, chooseUrl: link.toString() });
  }
  receipt.bookingOffer = { serviceName: offer.serviceName, slots };
  return receipt;
}

export function isInquiryBookingOffer(value: unknown): value is PublicInquiryBookingOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as PublicInquiryBookingOffer;
  if (typeof offer.serviceName !== "string" || typeof offer.timeZone !== "string" || typeof offer.url !== "string" || !Array.isArray(offer.slots) || !offer.slots.length || offer.slots.length > 3) return false;
  try { const url = new URL(offer.url); if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) return false; new Intl.DateTimeFormat(undefined, { timeZone: offer.timeZone }); } catch { return false; }
  return offer.slots.every(slot => slot && typeof slot.start === "string" && typeof slot.end === "string" && Number.isFinite(Date.parse(slot.start)) && Date.parse(slot.end) > Date.parse(slot.start));
}
