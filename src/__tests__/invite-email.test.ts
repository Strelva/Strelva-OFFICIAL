import { describe, expect, it } from "vitest";
import { buildInviteEmailHtml, buildInviteEmailText, sanitizeEmailSubjectText } from "@/lib/invite-email";

describe("invite email rendering", () => {
  it("sanitizes dynamic site names and escapes signup URLs in HTML", () => {
    const html = buildInviteEmailHtml({
      email: `Owner\r\nBcc: attacker@example.com`,
      siteName: `A&B <script>alert("x")</script>`,
      signUpUrl: `https://admin.example.com/sign-up?next="><script>alert(1)</script>`,
    });

    expect(html).toContain("A&amp;B alert(&quot;x&quot;)");
    expect(html).toContain(
      'href="https://admin.example.com/sign-up?next=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    expect(html).toContain("Owner Bcc: attacker@example.com");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("\r");
  });

  it("strips line breaks and markup from subject text", () => {
    expect(sanitizeEmailSubjectText("Client\r\nBcc: attacker@example.com")).toBe(
      "Client Bcc: attacker@example.com",
    );
    expect(sanitizeEmailSubjectText(`A&B <script>alert("x")</script>`)).toBe(
      `A&B alert("x")`,
    );
  });

  it("renders a plain-text invite with the signup link", () => {
    const text = buildInviteEmailText({
      email: "owner@example.com",
      siteName: "Client\r\nBcc: attacker@example.com",
      signUpUrl: "https://admin.example.com/sign-up",
    });

    expect(text).toContain("Your dashboard is ready");
    expect(text).toContain("You now have access to manage Client Bcc: attacker@example.com.");
    expect(text).toContain("Create your account: https://admin.example.com/sign-up");
    expect(text).toContain(
      "Use owner@example.com when signing up so your dashboard access connects automatically.",
    );
    expect(text).not.toContain("\r");
  });
});
