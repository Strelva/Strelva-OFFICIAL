/**
 * How to send inquiry email to the forwarding address from the mail host a
 * business already uses. Data, so the page, the agent and support read the
 * same steps. Client-safe.
 *
 * Checked against each host's public help pages on 2026-10-12, not against a
 * live account: menu names drift. `checkedOn` dates each entry.
 */
export type ForwardingHostId = "gmail" | "outlook" | "microsoft_365" | "icloud" | "godaddy" | "contact_form";

export interface ForwardingHostGuide {
  id: ForwardingHostId;
  label: string;
  /** One line: what this sets up. */
  summary: string;
  steps: string[];
  /** Things that commonly stop the test from arriving. */
  notes: string[];
  /** The host asks the forwarding address to confirm before it forwards anything. */
  confirmsAddress: boolean;
  checkedOn: string;
}

/** `{address}` is replaced with the business's forwarding address. */
export const FORWARDING_HOSTS: readonly ForwardingHostGuide[] = [
  {
    id: "gmail",
    label: "Gmail or Google Workspace",
    summary: "A filter forwards only the email you choose, such as your contact form's notices.",
    steps: [
      "In Gmail on a computer, open Settings (the gear), then See all settings.",
      "Open Forwarding and POP/IMAP and choose Add a forwarding address. Paste {address}, then Next, Proceed and OK.",
      "Gmail sends a confirmation to Strelva. Its code appears on this page within a minute. Enter the code in Gmail, or open the confirmation link shown here.",
      "Back in Gmail, open the search options (the sliders in the search bar). Put your contact form's sender in From, or the address customers write to in To, then choose Create filter.",
      "Tick Forward it to, choose {address}, then Create filter.",
    ],
    notes: [
      "Keep Forwarding itself on Disable forwarding: the filter forwards only matching email.",
      "A Google Workspace admin can turn off automatic forwarding for the whole company. If the confirmation never arrives, ask whoever manages your Google Workspace.",
    ],
    confirmsAddress: true,
    checkedOn: "2026-10-12",
  },
  {
    id: "outlook",
    label: "Outlook.com or Hotmail",
    summary: "An inbox rule redirects matching email and keeps the customer as the sender.",
    steps: [
      "In Outlook on the web, open Settings (the gear), then Mail, then Rules.",
      "Choose Add new rule and name it Strelva inquiries.",
      "Add a condition: From your contact form's sender, or Sent to the address customers write to.",
      "Add an action: Redirect to {address}. Redirect keeps the customer as the sender; Forward to also works.",
      "Save the rule.",
    ],
    notes: ["Rules run on new email only. Forward one past inquiry by hand to test now."],
    confirmsAddress: false,
    checkedOn: "2026-10-12",
  },
  {
    id: "microsoft_365",
    label: "Microsoft 365 (work or school Outlook)",
    summary: "The same Outlook rule, from a business Microsoft 365 mailbox.",
    steps: [
      "Sign in to Outlook on the web at outlook.office.com.",
      "Open Settings (the gear), then Mail, then Rules, and choose Add new rule.",
      "Add a condition for your inquiry email, then the action Redirect to {address}.",
      "Save the rule.",
    ],
    notes: [
      "Microsoft 365 blocks automatic forwarding to outside addresses by default. If the test never arrives, your Microsoft 365 admin has to allow automatic forwarding for your mailbox (outbound spam policy, Automatic forwarding rules).",
      "Forwarding one email by hand always works, even when rules are blocked.",
    ],
    confirmsAddress: false,
    checkedOn: "2026-10-12",
  },
  {
    id: "icloud",
    label: "iCloud Mail (Apple)",
    summary: "An iCloud Mail rule forwards matching email, even when your Mac is off.",
    steps: [
      "Sign in at icloud.com/mail on a computer.",
      "Open Settings (the gear), then Rules, then Add a rule.",
      "Choose If a message is from, or is addressed to, and enter your contact form's sender or your business address.",
      "Choose Then forward to, enter {address}, then Done.",
    ],
    notes: [
      "Avoid Settings, Forwarding, Forward my email to: it sends every email you get, not just inquiries.",
      "Rules made in the Mail app on a Mac only run while that Mac is on. Make the rule on icloud.com instead.",
    ],
    confirmsAddress: false,
    checkedOn: "2026-10-12",
  },
  {
    id: "godaddy",
    label: "GoDaddy email",
    summary: "GoDaddy sells Microsoft 365 and Professional Email. Use the steps for the one you have.",
    steps: [
      "Microsoft 365 from GoDaddy: sign in to Outlook on the web with your GoDaddy email login and follow the Microsoft 365 steps.",
      "Professional Email from GoDaddy: sign in to webmail, open Settings, then Mail, then Filters (or Rules), and add a filter that forwards your inquiry email to {address}.",
      "Not sure which you have? Your GoDaddy Email & Office dashboard names the plan.",
    ],
    notes: [
      "Microsoft 365 from GoDaddy can block forwarding to outside addresses. GoDaddy support or your admin can allow it.",
      "Forwarding one email by hand always works.",
    ],
    confirmsAddress: false,
    checkedOn: "2026-10-12",
  },
  {
    id: "contact_form",
    label: "Your website's contact form",
    summary: "Add Strelva as a second recipient, so each form entry reaches you and Strelva.",
    steps: [
      "Open your form tool's notification settings (Wix, Squarespace, WordPress, Jotform and others all have one).",
      "Add {address} as a BCC or a second recipient. Keep your own address too.",
      "Submit a test entry on your site.",
    ],
    notes: ["Strelva reads the name, email and message from the form's notice. Keep the field labels in the notice."],
    confirmsAddress: false,
    checkedOn: "2026-10-12",
  },
];

export function hostGuide(id: ForwardingHostId): ForwardingHostGuide | undefined {
  return FORWARDING_HOSTS.find((host) => host.id === id);
}

/** Steps with the business's address filled in. */
export function hostSteps(guide: ForwardingHostGuide, address: string): string[] {
  return guide.steps.map((step) => step.replaceAll("{address}", address));
}
