/**
 * Ask Strelva in the workspace (docs/product/specs/ask-strelva.md).
 *
 * Ask Strelva is the verb surface over Systems, Connections, Possibilities,
 * Versions, Requests and the business record. It produces exactly four kinds
 * of result: an answer, a drafted change (handed to Needs you), an opened
 * Possibility, or a Request to Strelva. It never decides what belongs to the
 * owner, and text in the conversation never approves anything.
 */

/** The four results, plus a refusal (which is always said, never silent). */
export type AskResultKind = "answer" | "draft" | "possibility" | "request" | "refusal";

/** Authority a tool needs (spec section 4, Authority). */
export type AskAuthority = "read" | "draft";

/**
 * The ordinary tool inventory. `tenant` names the tenant chat tools each one runs
 * (one implementation, src/lib/agent-shared.ts); `needsTenant` is true when it
 * acts on a linked managed website; `acts` marks tools that act through a
 * Connection and need its grant.
 */
export const ASK_TOOL_CATALOG = {
  read_system: { authority: "read", needsTenant: true, tenant: ["read_site", "read_section", "show_content", "show_photos", "preview_site", "list_entries", "list_subscribers", "get_suggestions"] },
  read_performance: { authority: "read", needsTenant: true, tenant: ["get_metrics", "explain_traffic", "show_report"] },
  read_history: { authority: "read", needsTenant: true, tenant: ["get_activity"] },
  read_connections: { authority: "read", needsTenant: true, tenant: ["show_connections"] },
  read_reviews: { authority: "read", needsTenant: true, tenant: ["get_reviews"] },
  read_requests: { authority: "read", needsTenant: false, tenant: [] },
  draft_website_change: { authority: "draft", needsTenant: true, tenant: ["patch_site", "update_section", "toggle_section_visibility", "reorder_sections"] },
  draft_system_change: { authority: "draft", needsTenant: false, tenant: [] },
  undo_change: { authority: "draft", needsTenant: true, tenant: ["undo_last_change"] },
  add_image: { authority: "draft", needsTenant: true, tenant: ["upload_image"] },
  draft_entry: { authority: "draft", needsTenant: true, tenant: ["save_entry"] },
  draft_newsletter: { authority: "draft", needsTenant: true, tenant: ["draft_newsletter"] },
  draft_gbp_post: { authority: "draft", needsTenant: true, acts: true, tenant: ["create_gbp_post"] },
  add_gbp_photo: { authority: "draft", needsTenant: true, acts: true, tenant: ["upload_gbp_photo"] },
  draft_business_fact_change: { authority: "draft", needsTenant: false, tenant: [] },
  draft_review_reply: { authority: "draft", needsTenant: true, tenant: ["reply_to_review"] },
  draft_inquiry_reply: { authority: "draft", needsTenant: true, tenant: [] },
  create_request: { authority: "draft", needsTenant: false, tenant: [] },
  open_possibility: { authority: "draft", needsTenant: false, tenant: [] },
} as const satisfies Record<string, { authority: AskAuthority; needsTenant: boolean; acts?: boolean; tenant: readonly string[] }>;

export type AskToolId = keyof typeof ASK_TOOL_CATALOG;
export const ASK_TOOL_IDS = Object.keys(ASK_TOOL_CATALOG) as AskToolId[];

/** Tenant chat tools Ask Strelva retires instead of carrying (spec, Tool inventory). */
export const ASK_RETIRED_TENANT_TOOLS = ["draft_social_post", "list_social_posts"] as const;
/** Tenant tools whose work moves to a workspace-native tool. */
export const ASK_REPLACED_TENANT_TOOLS = {
  request_custom_change: "create_request",
  create_suggestion: "open_possibility",
  update_business_hours: "draft_business_fact_change",
} as const;

/**
 * Change kinds, named as the Needs you policy names them
 * (src/platform/needs-you/contracts.ts on the needs-you stream). Kept as a
 * local union so this module does not depend on unmerged code.
 */
export type AskChangeKind =
  | "fact.owner_stated"
  | "fact.inferred"
  | "copy.routine"
  | "copy.marketing"
  | "structure"
  | "google.post"
  | "google.photo"
  | "review.reply"
  | "customer.message"
  | "customer.broadcast"
  | "request.scope"
  | "suggestion";

/** Where a draft goes, as the Needs you policy answers. `never` = blocked. */
export type AskNeedsYouRoute = "handle" | "handle_after_notice" | "strelva_reviews" | "owner_decides" | "never";

/** Who started the change. Ask drafts are interpreted by Strelva, so they
 * never inherit the owner's authority; an operator asking on the owner's
 * behalf is the operator. */
export type AskChangeOrigin = "owner_interpreted" | "operator";

/** "Asked by the owner by email/phone" when an operator asks on their behalf. */
export type AskedOnBehalf = "email" | "phone";

export const ASK_REFUSAL_CODES = [
  "money",
  "domains",
  "people",
  "exit_or_delete",
  "approval_in_chat",
  "direct_send",
  "ungranted_connection",
  "other_business",
  "custom_code",
  "credentials",
] as const;
export type AskRefusalCode = (typeof ASK_REFUSAL_CODES)[number];

/** One sentence each: the reason and where it is done instead (spec section 4). */
export const ASK_REFUSALS: Record<AskRefusalCode, string> = {
  money: "I can't change billing, plans, pay links or refunds from here. Billing is in Business details, or reply to your Strelva email and we'll sort it.",
  domains: "I can't add, remove or move a domain. Domains are in Business details, and Strelva handles domain moves for you.",
  people: "I can't invite people, change roles or remove anyone. People and access are in Business details, for an owner.",
  exit_or_delete: "I can't pause, export, delete or leave the business or a site from here. That's in Business details, for an owner.",
  approval_in_chat: "I can't approve anything from the conversation. Approve it in Needs you, or from the link in your email, so the approval stays tied to that exact change.",
  direct_send: "I don't send email, post to Google or publish on my own. I draft it, and it goes to Needs you for a yes.",
  ungranted_connection: "That needs a Google account connected with permission to make changes. Connecting it is the owner's call, in Connections.",
  other_business: "I can only work on this business's own Systems and records.",
  custom_code: "Custom code builds aren't something I can do. I can file it for Strelva as a Request.",
  credentials: "Please don't share passwords or keys here. I never need them, and I won't store or repeat them.",
};
