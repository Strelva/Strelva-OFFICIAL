/** Browser-safe acknowledgement helpers; no storage or provider authority. */
export { exactBusinessPageUrl, expectedConnectedSiteSystemId } from "./acknowledgement";

export { GUIDE_ORDER, installGuide, installStepsText } from "./install-guides";
export { detectSitePlatform, type PlatformDetection } from "./platform-detect";
export { STOPPED_REPORTING_AFTER_MS, connectedSiteHealth, type ConnectedSiteHealth, type ConnectedSiteHealthState } from "./site-health";
