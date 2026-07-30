import { describe, it, expect } from "vitest";
import { scoreLeadSpam, normalizeEmailForDedup, looksRandomToken } from "@/lib/lead-spam";

describe("lead spam scoring", () => {
  // Real records pulled from the live spam sample (2026-07).
  const realSpam = [
    { businessName: "Zbdhgvucw LLC", description: "Build request: kxAHGPUmOSFfVsvujITF", location: "thKtblVkgDHpLWFGVtGd", currentWebsite: "https://sgchqhi.com", email: "zg.ils.o.n1@gmail.com" },
    { businessName: "Bneiotrie LLC", description: "Build request: ebcchQsKhjIcUiNSCpR", location: "VGXVgaqFIZRHmEbyZ", currentWebsite: "https://lbugqvex.com", email: "jon.ziemann@us.storck.com" },
    { businessName: "dpIPbVoiMwIUfOBBNcVP", description: "Build request: ZDzklGDMQdATeWxY", location: "UclLvIIKFUvbxhMbyHs", currentWebsite: "fchDvLrnFOmKIZEZe", email: "contacto@host315.net" },
    { businessName: "Avppealud LLC", description: "Build request: bkMPsRqKtKtlWlBELBBS", location: "VFHuQQehzsrRopaFyYpj", currentWebsite: "https://erzcbquudod.com", email: "zu.g.o.zu.r.o.yiv.26.9@gmail.com" },
  ];

  it("flags every real spam record (score >= threshold)", () => {
    for (const s of realSpam) {
      const v = scoreLeadSpam(s);
      expect(v.isSpam, `${s.businessName} → ${JSON.stringify(v)}`).toBe(true);
      expect(v.score).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not flag real leads", () => {
    const legit = [
      { businessName: "Great Lakes Dried Fruit", description: "We sell dried fruit and want a better site", location: "Buffalo, NY", currentWebsite: "https://greatlakesdriedfruit.com", email: "owner@greatlakesdriedfruit.com" },
      { businessName: "Rohlax Wellness", description: "Massage therapy, need booking", location: "Cleveland, OH", currentWebsite: "rohlaxwellness.com", email: "jane@rohlax.com" },
      { businessName: "McLear's Grill", description: "Restaurant near the lake", location: "Port Colborne, ON", currentWebsite: "", email: "mclears@gmail.com" },
      { businessName: "Jazz's Yoga Studio", description: "Build request: new yoga site with schedule", location: "Toronto", currentWebsite: "linktr.ee/jazzyoga", email: "jazz@yahoo.com" },
    ];
    for (const l of legit) {
      const v = scoreLeadSpam(l);
      expect(v.isSpam, `${l.businessName} → ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it("catches gmail dot-obfuscation and honeypot-style empties safely", () => {
    expect(scoreLeadSpam({ email: "z.u.g.o.zu.r.o@gmail.com" }).signals).toContain("gmail-dot-obfuscation");
    // Empty input is never spam.
    expect(scoreLeadSpam({}).isSpam).toBe(false);
    expect(scoreLeadSpam({ businessName: "", location: "", email: "" }).isSpam).toBe(false);
  });

  it("looksRandomToken: consonant soup and case-flip, not real words", () => {
    expect(looksRandomToken("sgchqhi")).toBe(true);
    expect(looksRandomToken("thKtblVkgDHpLW")).toBe(true);
    expect(looksRandomToken("Buffalo")).toBe(false);
    expect(looksRandomToken("iPhone")).toBe(false);
    expect(looksRandomToken("NY")).toBe(false);
  });

  it("normalizeEmailForDedup collapses gmail dots and +tags", () => {
    expect(normalizeEmailForDedup("Z.u.Go1+promo@gmail.com")).toBe("zugo1@gmail.com");
    expect(normalizeEmailForDedup("first.last@company.com")).toBe("first.last@company.com");
  });
});
