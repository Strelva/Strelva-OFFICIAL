import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), tenant: vi.fn(), send: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mock.rpc }) }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mock.tenant }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: async () => "inherit" }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mock.send }; } }));
import { brandColors, contrastRatio, STRELVA_BRAND } from "@/platform/infra/agency-brand";
import { manageAgencyBrand, presentBrand, resolveOwnerBrand, resolveTenantBrand, validateBrand } from "@/platform/agency-brand/server";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { renderEmailHtml, renderEmailText } from "@/platform/infra/email/layout";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
const id = "b2640000-0000-4000-8000-000000000010";
const input = { displayName: 'North & Web <"Owner">', accentColor: "#ffff00", replyTo: "reply@north.example", logo: null, credit: "runs_on_strelva" as const };
const row = { agencyId: id, name: "Workspace agency", brand: input };
const brand = presentBrand(row);
const options = { brand, heading: "One decision", decisions: [{ title: "Publish the price?", approve: { label: "Approve", url: "https://app.strelva.com/api/approve?token=fixture" }, open: { label: "Needs you", url: "https://app.strelva.com/workspace" } }], secondaryButton: { label: "Not yet", url: "https://app.strelva.com/workspace" }, footerNote: "for The Mooney Firm" };
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("agency owner brand", () => {
  it("uses the service-resolved seat, independently per business; null stays Strelva", async () => {
    mock.rpc.mockResolvedValueOnce({ data: row, error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect(await resolveOwnerBrand(id)).toEqual(brand);
    expect(await resolveOwnerBrand("b2640000-0000-4000-8000-000000000020")).toEqual(STRELVA_BRAND);
    expect(mock.rpc.mock.calls.map(c => c[1])).toEqual([{ p_workspace_id: id }, { p_workspace_id: "b2640000-0000-4000-8000-000000000020" }]);
  });
  it("links tenant reports to the business and keeps unconverted tenants Strelva", async () => {
    mock.tenant.mockResolvedValueOnce(id).mockResolvedValueOnce(null); mock.rpc.mockResolvedValue({ data: row, error: null });
    expect(await resolveTenantBrand("agency-client")).toEqual(brand); expect(await resolveTenantBrand("self-serve")).toEqual(STRELVA_BRAND);
  });
  it("never hides read failures with another agency's brand", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "database offline" } });
    await expect(resolveOwnerBrand(id)).rejects.toThrow("Agency branding is unavailable");
  });
  it("passes verified identity to owner-only configuration, and surfaces revocation", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "agency_brand_access" } });
    await expect(manageAgencyBrand({ userId: id, verifiedEmail: "owner@example.test" }, id, input)).rejects.toThrow();
    expect(mock.rpc).toHaveBeenCalledWith("manage_agency_brand", { p_user_id: id, p_verified_email: "owner@example.test", p_workspace_id: id, p_brand: input });
  });
  it("selects AA text over every representative fill and never uses a pale accent as text on white", () => {
    for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
      const hex = `#${[r,g,b].map(v => v.toString(16).padStart(2,"0")).join("")}`;
      const c = brandColors(hex); expect(contrastRatio(c.accent, c.onAccent)).toBeGreaterThanOrEqual(4.5); expect(contrastRatio(c.onWhite, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
    expect(() => brandColors('red;"')).toThrow();
  });
  it("escapes agency names and snapshots decision emails with retained credit", () => {
    const html = renderEmailHtml(options);
    expect(html).toContain("North &amp; Web &lt;&quot;Owner&quot;&gt;"); expect(html).not.toContain(input.displayName);
    expect(html).toContain("background:#ffff00"); expect(html).toContain("color:#000000"); expect(html).toContain("Runs on Strelva.");
    expect(html).toMatchSnapshot(); expect(renderEmailText(options)).toMatchSnapshot();
    expect(renderEmailHtml({ ...options, brand: undefined })).toContain('alt="Strelva"');
  });
  it("accepts a real raster logo and rejects spoofed types, script, oversized and excessive dimensions", () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mV8AAAAASUVORK5CYII=";
    expect(validateBrand({ ...input, logo: { type: "image/png", data: png } }).logo).not.toBeNull();
    const image = presentBrand({ ...row, brand: { ...input, logo: { type: "image/png", data: png } } });
    expect(image.logoUrl).toMatch(/https:\/\/app.strelva.com\/api\/agency-brand\/logo\/.+\/[a-f0-9]{64}$/);
    for (const logo of [{ type: "image/svg+xml", data: btoa("<svg/>") }, { type: "image/png", data: btoa("<script/>") }, { type: "image/jpeg", data: png }, { type: "image/png", data: Buffer.alloc(262145).toString("base64") }]) expect(() => validateBrand({ ...input, logo })).toThrow();
    const giant = Buffer.from(png, "base64"); giant.writeUInt32BE(4096, 16);
    expect(() => validateBrand({ ...input, logo: { type: "image/png", data: giant.toString("base64") } })).toThrow();
    expect(() => validateBrand({ ...input, displayName: "Agency\r\nBcc: other@example.test" })).toThrow();
    expect(() => validateBrand({ ...input, credit: "hidden" })).toThrow();
  });
  it("renders a wrapped owner identity and reply link with the platform credit", () => {
    const html = renderToStaticMarkup(<OwnerBrandIdentity brand={brand} />);
    expect(html).toContain("North &amp; Web"); expect(html).toContain("Runs on Strelva."); expect(html).toContain("mailto:reply@north.example"); expect(html).toContain("overflow-wrap:anywhere");
  });
  it("sends owner options with the agency display/reply-to and a Strelva domain; preserves suppression", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("RESEND_DOMAIN", "unverified.example");
    mock.rpc.mockResolvedValue({ data: row, error: null }); mock.send.mockResolvedValue({ data: { id: "sent" }, error: null });
    await sendEmailWithReceipt({ audience: "client", workspaceId: id, to: "owner@example.test", subject: "Decision", fromAddress: "hello@agency.example", options: { heading: "Strelva needs one decision" } });
    expect(mock.send.mock.calls[0]![0]).toMatchObject({ from: "North & Web Owner <hello@updates.strelva.com>", replyTo: input.replyTo });
    expect(mock.send.mock.calls[0]![0].html).toContain("North &amp; Web &lt;&quot;Owner&quot;&gt;");
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false"); mock.rpc.mockClear();
    expect(await sendEmailWithReceipt({ audience: "client", workspaceId: id, to: "owner@example.test", subject: "Decision", options: { heading: "Decision" } })).toMatchObject({ status: "suppressed" }); expect(mock.rpc).not.toHaveBeenCalled();
  });
});
