/** Shared mail input shapes only; sending and approval policy stay with their owners. */
/**
 * Every field that comes in on the /access-request intake form. Carried whole
 * into the team-notification email so nobody has to open a screen to triage.
 */
export interface IntakeLeadFields {
  businessName: string;
  description?: string | null;
  location?: string | null;
  email: string;
  phone?: string | null;
  currentWebsite?: string | null;
  plan?: string | null;
  planLabel: string;
  referredBy?: string | null;
}

export interface BookingConfirmationInput {
  to: string;
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  businessName: string;
  tenantId?: string;
  logPrefix?: string;
}

export interface BookingOwnerNoticeInput {
  email: string;
  siteName: string;
  booking: { customerName: string; customerEmail?: string; serviceName: string; when: string };
  dashboardUrl: string;
  tenantId?: string;
  logPrefix?: string;
}

export interface NewIntakeLeadInput {
  lead: IntakeLeadFields;
  leadsUrl: string;
  logPrefix?: string;
}

export interface NewSignupInput {
  businessName: string;
  plan?: string;
  ownerEmail?: string;
  mrrDollars?: number;
  tenantUrl: string;
  logPrefix?: string;
}

export interface PaymentFailedInput {
  businessName: string;
  ownerEmail?: string;
  tenantUrl: string;
  logPrefix?: string;
}
