/**
 * What each assistant permission lets it do, in owner words (XA · R4 rows).
 * The OAuth server owns the scope names and what they grant; these strings
 * only describe them. Unknown scopes show as "Another permission" so an id
 * never reaches an owner.
 */
export const ASSISTANT_SCOPES: Readonly<Record<string, { title: string; detail: string }>> = {
  "business:read": { title: "Read your business facts and services", detail: "From your business record" },
  "website:read": { title: "Read your saved websites", detail: "The words and the current release" },
  "website:propose": { title: "Prepare website changes", detail: "They come to you for a yes. It can't publish them." },
  "website:code": { title: "Pick up website changes for a coding agent", detail: "It reports previews and deploys. It can't approve or make anything live." },
  "inquiries:read": { title: "Read recent inquiries", detail: "Including your customers' contact details" },
  "quotes:approve": { title: "Record a price and terms you approve", detail: "It doesn't send email or charge anyone" },
  offline_access: { title: "Stay connected", detail: "Renews for up to 30 days while your permissions last" },
};

export function assistantScope(scope: string) {
  return ASSISTANT_SCOPES[scope] ?? { title: "Another permission", detail: "Ask whoever set up this assistant what it covers" };
}

/** What an assistant never does, whatever it was granted. */
export const ASSISTANT_NEVER: readonly { title: string; end: string }[] = [
  { title: "Make anything live", end: "Your yes" },
  { title: "Send email or charge your customers", end: "Never" },
  { title: "Keep access after you disconnect it", end: "Ends at once" },
];
