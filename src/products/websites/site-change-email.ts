import { emailSendingEnabled } from "@/platform/infra/email/enabled";

/**
 * Whether Needs you may email an owner about a website change. Two switches,
 * both off by default: sending at all (EMAIL_SENDING_ENABLED) and this
 * notice (STRELVA_SITE_CHANGE_OWNER_EMAIL=1). Pages say plainly when it is off.
 */
export const siteChangeOwnerEmailEnabled = (): boolean => emailSendingEnabled() && process.env.STRELVA_SITE_CHANGE_OWNER_EMAIL === "1";
