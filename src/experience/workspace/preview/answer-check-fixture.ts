import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";

/** Fictional canon example. No sampled answer or claim accuracy exists in the live response contract. */
export const answerCheckFixture: AiVisibilityResult = {
  business: "The Mooney Firm", url: "attymooney.com", score: 48, grade: "F", measurementStatus: "measured", readinessMeasured: true,
  verdict: "Gemini gets two things wrong in this fictional sample.",
  topFix: "Put your hours and services on the site in a form Google can read. Today they’re in a photo.",
  citation: { probed: true, mentioned: true, recommended: true, note: "Fictional Gemini answer." },
  signals: [
    { id: "identity", label: "Business name and address", pass: true, detail: "found on every page", weight: 20 },
    { id: "hours", label: "Hours", pass: false, detail: "only inside an image on /contact", weight: 20 },
    { id: "services", label: "Services", pass: true, detail: "found on /services", weight: 20 },
    { id: "prices", label: "Prices", pass: true, detail: "found on /fees", weight: 10 },
    { id: "contact", label: "Who to contact", pass: false, detail: "a form, no email or phone in text", weight: 10 },
    { id: "schema", label: "Business details for Google", pass: false, detail: "none of the markup Google reads", weight: 20 },
  ],
};
export const answerSampleFixture = {
  prompt: "Who is a good mediator in Buffalo for a business dispute?",
  lines: [
    { text: "The Mooney Firm in Buffalo offers mediation for business and workplace disputes." },
    { text: "They also handle divorce mediation", wrong: true },
    { text: "and are open on Saturdays.", wrong: true },
    { text: "Sheri is the lead mediator." },
  ],
  explanation: "Divorce isn’t on the site. Saturdays: the site doesn’t say, so Gemini guessed.",
};
