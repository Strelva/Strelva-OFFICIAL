import { emailSendingEnabled } from "@/platform/infra/email/enabled";
import { ownerEmailStreamOn } from "@/platform/infra/email/owner-streams";

/**
 * Whether Needs you may email an owner about a website change. Two switches,
 * both off by default: sending at all (EMAIL_SENDING_ENABLED, or the needs_you
 * owner email stream, which mails confirmed owners only) and this
 * notice (STRELVA_SITE_CHANGE_OWNER_EMAIL=1). Pages say plainly when it is off.
 */
export const siteChangeOwnerEmailEnabled = (): boolean => (emailSendingEnabled() || ownerEmailStreamOn("needs_you")) && process.env.STRELVA_SITE_CHANGE_OWNER_EMAIL === "1";
