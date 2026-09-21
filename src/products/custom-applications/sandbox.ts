/**
 * The released artifact may contain local interaction, so the iframe grants
 * scripts an opaque origin. The fixed document prefix is emitted before any
 * artifact bytes, so an early script cannot run before this policy is parsed.
 * Multiple CSP policies intersect; an artifact meta tag cannot weaken it.
 * The link guard covers ordinary outgoing links. The standalone recipient
 * parent adds CUSTOM_APPLICATION_PARENT_CSP because Chromium does not enforce
 * the navigate-to directive used by the artifact policy for self-navigation.
 * The shared workspace preview keeps this artifact boundary operator-reviewed
 * because a document-level CSP would persist across its SPA view changes.
 */
export const CUSTOM_APPLICATION_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "navigate-to 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

// This policy belongs to the document that owns the artifact iframe. It is
// intentionally narrower than the control-plane policy: the released app may
// render local srcdoc content, but it must not navigate that frame to a
// network document. Multiple CSP policies intersect, so this cannot weaken the
// broader response policy used by the parent page.
export const CUSTOM_APPLICATION_PARENT_CSP = "frame-src 'none'";

const policyTag = `<meta http-equiv="Content-Security-Policy" content="${CUSTOM_APPLICATION_CSP}">`;
const navigationGuard = `<script>(function(){document.addEventListener('click',function(event){var target=event.target;if(!(target instanceof Element))return;var link=target.closest('a[href]');var href=link&&link.getAttribute('href');if(link&&(!href||href.charAt(0)!=='#'))event.preventDefault();},true);window.open=function(){return null;};})();</script>`;

/** Prefix the artifact with the fixed policy, then let the browser parse it. */
export function customApplicationSandboxHtml(html: string): string {
  return `<!doctype html><html><head>${policyTag}${navigationGuard}</head><body>${html}</body></html>`;
}
