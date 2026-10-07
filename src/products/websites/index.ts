/** Server entry for hosted v2 websites. Browser consumers use ./client, whose
 * exports stay independent of storage, models, providers and node:crypto.
 * The existing v1 ./server entry remains unchanged. */
export * from "./rebuild-release";
export * from "./rebuild-contracts";
export * from "./rebuild-possibility";
export * from "./rebuild-audit-contracts";
export * from "./rebuild-audit";
export * from "./site-document";
export * from "./document-store";
// Keep the non-UI server APIs usable in Node scripts. React/CSS is loaded only
// when a Next route asks to render a hosted page.
export const getHostedSite: typeof import("./hosted-public").getHostedSite = (...args) => import("./hosted-public").then(module => module.getHostedSite(...args));
export const hostedPageMetadata: typeof import("./hosted-public").hostedPageMetadata = (...args) => import("./hosted-public").then(module => module.hostedPageMetadata(...args));
export const renderHostedPage: typeof import("./hosted-public").renderHostedPage = (...args) => import("./hosted-public").then(module => module.renderHostedPage(...args));
export * from "./site-seo";
export * from "./site-routing";
export * from "./site-health";
export * from "./domain-verification";
export * from "./site-sharing";
export type { WebsiteMonthlyReport } from "./site-report";
export * from "./site-operations";
export * from "./rebuild-export";
export * from "./rebuild-pipeline";
export * from "./rebuild-crawl";
export * from "./rebuild-composer";
export * from "./site-export";
// Scoped services and provider-backed reporting initialize only when called.
export const createWebsiteRebuild: typeof import("./rebuild-service").createWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.createWebsiteRebuild(...args));
export const readWebsiteRebuild: typeof import("./rebuild-service").readWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.readWebsiteRebuild(...args));
export const listWebsiteRebuilds: typeof import("./rebuild-service").listWebsiteRebuilds = (...args) => import("./rebuild-service").then(module => module.listWebsiteRebuilds(...args));
export const retryWebsiteRebuild: typeof import("./rebuild-service").retryWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.retryWebsiteRebuild(...args));
export const resolveWebsiteRebuildFact: typeof import("./rebuild-service").resolveWebsiteRebuildFact = (...args) => import("./rebuild-service").then(module => module.resolveWebsiteRebuildFact(...args));
export const approveWebsiteRebuild: typeof import("./rebuild-service").approveWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.approveWebsiteRebuild(...args));
export const launchWebsiteRebuild: typeof import("./rebuild-service").launchWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.launchWebsiteRebuild(...args));
export const publishWebsiteRebuildOntoLinkedSite: typeof import("./rebuild-service").publishWebsiteRebuildOntoLinkedSite = (...args) => import("./rebuild-service").then(module => module.publishWebsiteRebuildOntoLinkedSite(...args));
export const patchWebsiteRebuild: typeof import("./rebuild-service").patchWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.patchWebsiteRebuild(...args));
export const undoWebsiteRebuild: typeof import("./rebuild-service").undoWebsiteRebuild = (...args) => import("./rebuild-service").then(module => module.undoWebsiteRebuild(...args));
export const websiteRebuildDomain: typeof import("./rebuild-service").websiteRebuildDomain = (...args) => import("./rebuild-service").then(module => module.websiteRebuildDomain(...args));
export const initializeRebuildHandoff: typeof import("./rebuild-service").initializeRebuildHandoff = (...args) => import("./rebuild-service").then(module => module.initializeRebuildHandoff(...args));
export const connectWebsiteRebuildCapabilities: typeof import("./rebuild-service").connectWebsiteRebuildCapabilities = (...args) => import("./rebuild-service").then(module => module.connectWebsiteRebuildCapabilities(...args));
export const isWebsiteRebuildWork: typeof import("./rebuild-capabilities").isWebsiteRebuildWork = (...args) => import("./rebuild-capabilities").then(module => module.isWebsiteRebuildWork(...args));
export const listWebsiteRebuildCapabilityOptions: typeof import("./rebuild-capabilities").listWebsiteRebuildCapabilityOptions = (...args) => import("./rebuild-capabilities").then(module => module.listWebsiteRebuildCapabilityOptions(...args));
export const connectWebsiteRebuildCapabilitySelection: typeof import("./rebuild-capabilities").connectWebsiteRebuildCapabilitySelection = (...args) => import("./rebuild-capabilities").then(module => module.connectWebsiteRebuildCapabilitySelection(...args));
export const readWebsiteMonthlyReport: typeof import("./site-report").readWebsiteMonthlyReport = (...args) => import("./site-report").then(module => module.readWebsiteMonthlyReport(...args));
export const sendWebsiteMonthlyReport: typeof import("./site-report").sendWebsiteMonthlyReport = (...args) => import("./site-report").then(module => module.sendWebsiteMonthlyReport(...args));
export const sendOwnerWebsiteMonthlyReport: typeof import("./site-report").sendOwnerWebsiteMonthlyReport = (...args) => import("./site-report").then(module => module.sendOwnerWebsiteMonthlyReport(...args));
export const runWebsiteMonthlyReports: typeof import("./site-report").runWebsiteMonthlyReports = (...args) => import("./site-report").then(module => module.runWebsiteMonthlyReports(...args));
export { generateWebsiteDraft, websiteDraftPreviewHtml } from "./generation";

export * from "./rebuild-providers";
export { askPageSetSchema, composeAskPageSet } from "./ask-page-set";
export const prepareAskPageSet: typeof import("./ask-page-set").prepareAskPageSet = (...args) => import("./ask-page-set").then(module => module.prepareAskPageSet(...args));
export const prepareWebsiteBookingPage: typeof import("./rebuild-service").prepareWebsiteBookingPage = (...args) => import("./rebuild-service").then(module => module.prepareWebsiteBookingPage(...args));
export * from "./rebuild-benchmark";

export const readAgencyWebsiteDocument: typeof import("./agency-document-service").readAgencyWebsiteDocument = (...args) => import("./agency-document-service").then(module => module.readAgencyWebsiteDocument(...args));
export const patchAgencyWebsiteDocument: typeof import("./agency-document-service").patchAgencyWebsiteDocument = (...args) => import("./agency-document-service").then(module => module.patchAgencyWebsiteDocument(...args));

export const previewAgencyWebsiteDocument: typeof import("./agency-document-service").previewAgencyWebsiteDocument = (...args) => import("./agency-document-service").then(module => module.previewAgencyWebsiteDocument(...args));

export { askExistingPagesSchema, existingWebsitePageOperations } from "./ask-existing-pages";
export const prepareExistingWebsitePages: typeof import("./rebuild-service").prepareExistingWebsitePages = (...args) => import("./rebuild-service").then(module => module.prepareExistingWebsitePages(...args));
