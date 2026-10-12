/**
 * Fictional forwarded messages, shaped like Resend's received-email read
 * (emails.receiving.get): the bodies follow what Gmail, Outlook and Apple Mail
 * put in a forwarded message's text part. No real people or addresses.
 */
import type { ReceivedMessage } from "@/products/inquiry-forwarding/parse";

export const INBOUND_DOMAIN = "reply.example.test";
export const BAKERY_LOCAL = `fwd-${"bakery".padEnd(23, "0")}1`;
export const FLORIST_LOCAL = `fwd-${"florist".padEnd(23, "0")}1`;

function message(overrides: Partial<ReceivedMessage>): ReceivedMessage {
  return {
    id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c", from: "Pat Owner <pat@bakery.example.test>", to: [`${BAKERY_LOCAL}@${INBOUND_DOMAIN}`],
    cc: [], bcc: [], replyTo: [], subject: "", text: null, html: null, headers: {}, messageId: "<forward-1@mail.example.test>", ...overrides,
  };
}

export const gmailForward = message({
  subject: "Fwd: Wedding cake for June",
  messageId: "<CAGmail-forward-1@mail.gmail.example.test>",
  text: [
    "See below, can you log this?",
    "",
    "---------- Forwarded message ---------",
    "From: Jane Doe <jane.doe@customer.example.test>",
    "Date: Mon, Oct 12, 2026 at 9:14 AM",
    "Subject: Wedding cake for June",
    "To: <pat@bakery.example.test>",
    "",
    "",
    "Hi! Do you make three-tier wedding cakes? We need one for June 14, about 120 guests.",
    "My number is 716-555-0142.",
    "",
    "Thanks,",
    "Jane",
  ].join("\n"),
});

export const outlookForward = message({
  subject: "FW: Catering quote",
  from: "Pat Owner <pat@bakery.example.test>",
  messageId: "<SA1PR-outlook-forward@outlook.example.test>",
  text: [
    "",
    "________________________________",
    "From: Sam Rivera <sam@rivera-events.example.test>",
    "Sent: Monday, October 12, 2026 9:14 AM",
    "To: Pat Owner <pat@bakery.example.test>",
    "Subject: Catering quote",
    "",
    "Hello, could you quote 200 pastries for a corporate breakfast on Oct 30?",
    "",
    "Sam",
  ].join("\r\n"),
});

export const outlookOriginalMessage = message({
  subject: "FW: Allergy question",
  text: [
    "-----Original Message-----",
    "From: Lee Park [mailto:lee.park@customer.example.test]",
    "Sent: Tuesday, October 13, 2026 8:02 AM",
    "To: info@bakery.example.test",
    "Subject: Allergy question",
    "",
    "Are your loaves made in a nut-free kitchen?",
  ].join("\n"),
});

export const appleForward = message({
  subject: "Fwd: Birthday order",
  from: "Pat Owner <pat@icloud.example.test>",
  messageId: "<apple-forward-1@icloud.example.test>",
  text: [
    "",
    "",
    "Begin forwarded message:",
    "",
    "From: Morgan Lee <morgan.lee@customer.example.test>",
    "Subject: Birthday order",
    "Date: October 12, 2026 at 9:14:00 AM EDT",
    "To: pat@icloud.example.test",
    "",
    "Can I pick up a chocolate cake with \"Happy 40th\" on Friday?",
    "",
  ].join("\n"),
});

/** A Gmail forward sent as HTML only. */
export const gmailHtmlOnly = message({
  subject: "Fwd: Gluten free?",
  text: null,
  html: "<div dir=\"ltr\">fyi<br><br><div class=\"gmail_quote\"><div dir=\"ltr\" class=\"gmail_attr\">---------- Forwarded message ---------<br>From: <strong class=\"gmail_sendername\">Chris Kim</strong> <span dir=\"auto\">&lt;<a href=\"mailto:chris.kim@customer.example.test\">chris.kim@customer.example.test</a>&gt;</span><br>Date: Mon, Oct 12, 2026 at 10:01 AM<br>Subject: Gluten free?<br>To: &lt;pat@bakery.example.test&gt;<br></div><br><br><div dir=\"ltr\">Do you have gluten-free bread on Saturdays?</div></div></div>",
});

/** A contact form's notice BCC'd straight to the address: the form sends, the customer is Reply-To. */
export const plainBccFormNotice = message({
  from: "Wix Forms <no-reply@wixforms.example.test>",
  to: ["pat@bakery.example.test"],
  bcc: [],
  replyTo: ["Riley Smith <riley.smith@customer.example.test>"],
  subject: "New form submission: Contact us",
  messageId: "<wix-notice-1@wixforms.example.test>",
  headers: { "Delivered-To": `${BAKERY_LOCAL}@${INBOUND_DOMAIN}`, "Message-ID": "<wix-notice-1@wixforms.example.test>" },
  text: [
    "You have a new submission on Contact us.",
    "",
    "Name: Riley Smith",
    "Email: riley.smith@customer.example.test",
    "Phone: (716) 555-0199",
    "Message: Hi, do you deliver to Amherst?",
    "We'd need two dozen cupcakes.",
    "",
    "View all submissions in your dashboard.",
  ].join("\n"),
});

/** An auto-forward or redirect: the customer's own message, original Message-ID intact. */
export const autoForwarded = message({
  from: "Alex Chen <alex.chen@customer.example.test>",
  to: ["orders@bakery.example.test"],
  subject: "Order for Sunday",
  messageId: "<original-alex-1@customer.example.test>",
  headers: { "Message-ID": "<original-alex-1@customer.example.test>", "X-Forwarded-To": `${BAKERY_LOCAL}@${INBOUND_DOMAIN}` },
  text: "Hi, can I order a dozen bagels for Sunday morning pickup?",
});

export const gmailConfirmation = message({
  from: "Gmail Team <forwarding-noreply@google.com>",
  subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from pat.owner@gmail.example.test",
  text: [
    "pat.owner@gmail.example.test has requested to automatically forward mail to your email",
    `address ${BAKERY_LOCAL}@${INBOUND_DOMAIN}.`,
    "Confirmation code: 123456789",
    "",
    "To allow pat.owner@gmail.example.test to automatically forward mail to your address, please click the link below to confirm the request:",
    "",
    "https://mail-settings.google.com/mail/vf-%5BANGjdJ-fixture%5D-fixture",
  ].join("\n"),
});

export const outOfOffice = message({ from: "Jane Doe <jane.doe@customer.example.test>", subject: "Automatic reply: Wedding cake", headers: { "Auto-Submitted": "auto-replied" }, text: "I'm away until Monday." });
export const bounce = message({ from: "Mail Delivery Subsystem <mailer-daemon@mail.example.test>", subject: "Delivery Status Notification (Failure)", text: "Address not found." });
export const loop = message({ from: `Strelva <inquiry+abc@${INBOUND_DOMAIN}>`, subject: "Re: Your inquiry", text: "Loop" });
export const spamFlagged = message({ from: "Prize Desk <winner@lottery.example.test>", subject: "You won", headers: { "X-Spam-Flag": "YES" }, text: "Claim your prize now." });
export const newsletter = message({ from: "Flour Weekly <news@flourweekly.example.test>", subject: "This week in flour", headers: { "List-Unsubscribe": "<mailto:unsubscribe@flourweekly.example.test>" }, text: "Our top stories." });
