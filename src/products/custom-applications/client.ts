/**
 * Browser-safe artifact preview helpers. Keep this entry free of lifecycle,
 * database, and Docker imports so experiences can render the same boundary.
 */
export { CUSTOM_APPLICATION_CSP, CUSTOM_APPLICATION_PARENT_CSP, customApplicationSandboxHtml } from "./sandbox";
