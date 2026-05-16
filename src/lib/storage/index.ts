/**
 * Storage module index - re-exports all storage functions.
 * Import from "@/lib/storage" remains unchanged.
 */

// Core
export { DEFAULT_TENANT } from "./core";

// Content
export { getContent, setContent, SECTION_TO_TYPE } from "./content-store";

// Versions
export { appendVersion, getVersions, restoreVersion } from "./version-store";
export type { ContentVersion } from "./version-store";

// Drafts
export { getDraftContent, setDraftContent, clearDraft, listDrafts } from "./draft-store";

// Inbox
export { addInboxItem, getInboxItems, markInboxRead, markAllInboxRead } from "./inbox-store";
export type { InboxItem } from "./inbox-store";

// Activity
export { logActivity, getActivity } from "./activity-store";
export type { ActivityEntry } from "./activity-store";

// Admin Audit
export { logAuditEvent, getAuditLog } from "./audit-store";
export type { AuditLogEntry } from "./audit-store";

// Chat
export { saveChatMessages, loadChatMessages } from "./chat-store";

// Uploads
export { uploadFile } from "./upload-store";

// Analytics
export {
  trackClick,
  getClickCounts,
  getDailyMetrics,
  getLastClickDate,
  getClickCountsByPrefix,
  recordSectionUpdate,
  getSectionTimestamps,
} from "./analytics-store";
export type { DailyMetric } from "./analytics-store";

// Booking
export {
  getBookingConfig,
  setBookingConfig,
  getDateOverrides,
  getBookings,
  createBooking,
  createBookingAtomic,
  updateBooking,
  getAvailableSlots,
  isSlotClaimed,
} from "./booking-store";

// Newsletter
export { addSubscriber, getSubscribers } from "./newsletter-store";
export type { NewsletterSubscriber } from "./newsletter-store";

// Social
export { getSocialPosts, setSocialPosts } from "./social-store";

// Search
export { getSearchData, setSearchData } from "./search-store";

// Reports
export { saveWeeklyReport, getWeeklyReports } from "./report-store";
export type { StoredWeeklyReport } from "./report-store";

// Full-site snapshots
export {
  createDailySiteSnapshot,
  createSiteSnapshot,
  getLatestSiteSnapshot,
  getSiteSnapshots,
  restoreSiteSnapshot,
  SITE_SNAPSHOT_SECTIONS,
} from "./site-snapshot-store";
export type {
  SiteSnapshot,
  SiteSnapshotReason,
  SiteSnapshotSummary,
} from "./site-snapshot-store";

// Page Config
export {
  clearDraftPageConfig,
  getDraftPageConfig,
  getPageConfig,
  setDraftPageConfig,
  setPageConfig,
} from "./page-config-store";
