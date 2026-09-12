export type InquiryShellStatus = {
  name: string;
  href: string;
  detail: string;
  status: "ready" | "coming_soon";
};

/**
 * Review-only map of the interface promised by the inquiry-first migration.
 * "Ready" means the narrow inquiry journey is present locally. A coming-soon
 * row still has its complete screen shell, but names the broader behavior that
 * has not been built yet.
 */
export const INQUIRY_SHELL_STATUS: InquiryShellStatus[] = [
  { name: "Sidebar", href: "/preview/strelva/inquiries?view=home", detail: "New, Search, businesses or clients, recent work, and account.", status: "ready" },
  { name: "Business home", href: "/preview/strelva/inquiries?view=home", detail: "The four-part home works for inquiry work. Other kinds of work will join it later.", status: "coming_soon" },
  { name: "New", href: "/preview/strelva/inquiries?view=new", detail: "Describe the result you want, then review its shape before work begins.", status: "ready" },
  { name: "Work", href: "/preview/strelva/inquiries?view=work", detail: "Request, shape, plan, editable preview, receipt, rehearsal, and Make live.", status: "ready" },
  { name: "Capability", href: "/preview/strelva/inquiries?view=search", detail: "Inquiry records and rules work. Bookings and other record types are coming soon.", status: "coming_soon" },
  { name: "Record", href: "/preview/strelva/inquiries?view=record", detail: "One customer request with its details and retained timeline.", status: "ready" },
  { name: "Right rail", href: "/preview/strelva/inquiries?view=record", detail: "Record history works. Actions and the small ‘on this’ request box are coming soon.", status: "coming_soon" },
  { name: "Rehearsal", href: "/preview/strelva/inquiries?view=rehearsal", detail: "A visibly fake customer journey, test inbox, fast clock, and saved checks.", status: "ready" },
  { name: "Change receipt", href: "/preview/strelva/inquiries?view=receipt", detail: "Before and after, one Make live action, and Undo that preserves new inquiries.", status: "ready" },
  { name: "Why", href: "/preview/strelva/inquiries?view=why", detail: "A short cause-and-effect story with the broken step and a safe next action.", status: "ready" },
  { name: "Responsibility", href: "/preview/strelva/inquiries?view=responsibility", detail: "Scope, limits, budget, escalation, trust, pause, and action receipts.", status: "ready" },
  { name: "Connections", href: "/preview/strelva/inquiries?view=connections", detail: "Consent and access details work for current providers. General task-scoped connections are coming soon.", status: "coming_soon" },
  { name: "Onboarding", href: "/preview/strelva/inquiries?view=onboarding", detail: "Website facts can be checked and corrected in place.", status: "ready" },
  { name: "Agency", href: "/preview/strelva/inquiries?audience=agency&view=attention", detail: "Attention and reusable inquiry patterns work. More work types and agency contribution are coming soon.", status: "coming_soon" },
];

export const INQUIRY_SHELL_COVERAGE = {
  readyShells: INQUIRY_SHELL_STATUS.length,
  totalShells: INQUIRY_SHELL_STATUS.length,
  completeFirstSlice: INQUIRY_SHELL_STATUS.filter((item) => item.status === "ready").length,
  comingSoon: INQUIRY_SHELL_STATUS.filter((item) => item.status === "coming_soon").length,
};
