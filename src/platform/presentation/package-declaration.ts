/** The same package declaration words for makers and recipients. Unknown terms
 * stay visible rather than silently changing the declared permission. */
const LABELS: Readonly<Record<string, string>> = {
  "application.records": "Internal tool records",
  "internal_tool.notices": "Submission email notices",
  "business.contacts": "Business contacts",
  "business.people": "Business staff",
  "business.record": "Business record",
  "business.record.history": "Business record history",
  "owner_recipient.email": "Owner email",
  "owner_recipient.name": "Owner name",
  "tenant.owner_email": "Linked owner email",
  "contacts.email": "Contact emails",
  "contacts.phone": "Contact phones",
  "people.email": "Staff emails",
  "people.active": "Current staff status",
  "contacts.id": "Contact identity",
  "contacts.name": "Contact names",
  "people.id": "Staff identity",
  "people.name": "Staff names",
  "email_sender": "Business email account",
  "booking_calendar": "Business calendar",
  "inquiries": "Inquiry records",
  "website.document": "Website pages",
  "website": "Business website",
  "email": "Business email",
  "publish": "Public website publication",
};

export function packageDeclarationLabel(value: string): string {
  return LABELS[value] ?? value;
}
