import { NextResponse } from "next/server";

/**
 * The newsletter unsubscribe page (GET confirm, POST result) as one standalone
 * document: mail clients POST straight to the route, so there is no React
 * runtime. XA visitor look (paper, ink, DM Sans), light and dark from the
 * device. The business's name heads it; Strelva is not named.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function unsubscribePage(status: number, title: string, body: string, options: { form?: string; business?: string; tone?: "done" | "problem" } = {}): NextResponse {
  // Mail clients POST directly to this HTML endpoint. Keep that transport; the
  // standalone document carries the XA visitor look (paper, ink, DM Sans) with
  // no React runtime. The business's name heads it; Strelva is not named.
  const mark = options.tone === "done" ? `<p class="state"><span class="dot"></span>Unsubscribed</p>` : options.tone === "problem" ? `<p class="state problem"><span class="dot"></span>Nothing changed</p>` : "";
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light dark;--canvas:#faf9f6;--text:#161715;--muted:#6b6f68;--line:#e6e5e0;--ink:#161715;--on-ink:#ffffff;--moss:#3e8e5a;--clay:#c9773f}
@media (prefers-color-scheme:dark){:root{--canvas:#141513;--text:#f1f0ec;--muted:#a3a69f;--line:#2a2b28;--ink:#f1f0ec;--on-ink:#141513}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);font-family:'DM Sans',system-ui,-apple-system,sans-serif;color:var(--text)}
main{max-width:520px;min-height:100dvh;margin:auto;padding:40px 24px 32px;display:flex;flex-direction:column}
.brand{margin:0 0 56px;font-size:17px;font-weight:600;letter-spacing:-.2px;color:var(--text)}
.state{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:15px;color:var(--muted)}.dot{width:7px;height:7px;border-radius:999px;background:var(--moss)}.problem .dot{background:var(--clay)}
h1{font-size:34px;font-weight:600;line-height:40px;letter-spacing:-.8px;margin:0;text-wrap:balance}p.body{font-size:17px;line-height:26px;color:var(--muted);margin:12px 0 0}
form{margin-top:32px}button{font:inherit;font-size:16px;font-weight:600;min-height:52px;width:100%;padding:14px 24px;border-radius:999px;border:0;background:var(--ink);color:var(--on-ink);cursor:pointer;transition:transform 80ms ease}
button:active{transform:scale(.98)}button:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
footer{margin-top:auto;padding-top:40px;font-size:13px;line-height:20px;color:var(--muted)}
@media (prefers-reduced-motion:reduce){button{transition:none}button:active{transform:none}}
@media (max-width:520px){main{padding:24px 16px}.brand{margin-bottom:40px}h1{font-size:30px;line-height:36px}}
</style></head><body><main>${options.business ? `<p class="brand">${escapeHtml(options.business)}</p>` : ""}${mark}<h1>${escapeHtml(title)}</h1><p class="body">${escapeHtml(body)}</p>${options.form ?? ""}<footer>Writing to ${options.business ? escapeHtml(options.business) : "the business"} through its website still works the same.</footer></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

