/**
 * Fictional outcome numbers for the local preview only. Hertel Ave Bakery and
 * Comfort Air are made-up businesses; the numbers mirror the October 6 Pen
 * boards ("07 · ICP components v2") and are illustrative until the outcome
 * loop is joined. Nothing here is read by a live route.
 */
import type { AiMirrorData } from "../outcomes/ai-mirror";
import type { LoopRibbonProps } from "../outcomes/LoopRibbon";
import type { HeatmapRow } from "../outcomes/location-heatmap";
import type { PriceTerm } from "../outcomes/PriceSheet";
import type { RatingPoint } from "../outcomes/rating-trend";
import type { ReplyLead } from "../outcomes/reply-pattern";
import type { WeeklyReport } from "../outcomes/weekly-report";

/** Preview stand-in for a receipts page. */
const RECEIPTS = "/preview/strelva/recaps";

export const BAKERY_LOOP: LoopRibbonProps = {
  eyebrow: "This week at Hertel Ave",
  trend: "+18% vs last week",
  footer: "That's 9 tables you didn't have to chase, about a week of catering.",
  stages: [
    { key: "found", label: "found you", detail: "Google, Maps, AI answers", value: 412, kind: "count", estimated: true },
    { key: "asked", label: "asked", detail: "calls, texts, forms", value: 23, kind: "count", receiptHref: RECEIPTS },
    { key: "answered", label: "answered", detail: "every one · 4 min median", value: 23, kind: "count", receiptHref: RECEIPTS },
    { key: "booked", label: "booked", detail: "tastings and orders", value: 9, kind: "count", receiptHref: RECEIPTS },
    { key: "earned", label: "earned", detail: "through Square", value: 1840, kind: "currency", receiptHref: RECEIPTS },
  ],
};

/** The same loop before anything is connected: every stage "Not measured yet". */
export const BAKERY_LOOP_EMPTY: LoopRibbonProps = {
  eyebrow: "This week at Hertel Ave",
  stages: BAKERY_LOOP.stages.map(stage => ({ ...stage, value: null, receiptHref: undefined })),
};

/** Partly connected: site traffic and inquiries, no booking or payment source yet. */
export const BAKERY_LOOP_PARTIAL: LoopRibbonProps = {
  eyebrow: "This week at Hertel Ave",
  stages: BAKERY_LOOP.stages.map(stage => stage.key === "booked" || stage.key === "earned" ? { ...stage, value: null, receiptHref: undefined } : stage),
};

export const BAKERY_AI_MIRROR: AiMirrorData = {
  eyebrow: "When Buffalo asks AI",
  businessName: "Hertel Ave Bakery",
  mentionedCount: 19,
  total: 24,
  summary: "Up from 11 in July. One answer had your hours wrong; Strelva fixed the source.",
  answer: {
    query: "best catering bakery near Hertel",
    text: "Your best bet is Hertel Ave Bakery. Trays from $45 with 48 hours notice, and a 4.8 on Google.",
    citations: [{ label: "bakery-hertel.com/catering" }, { label: "Google · 212 reviews" }],
  },
  assistants: [
    { id: "chatgpt", label: "ChatGPT" },
    { id: "google_ai", label: "Google AI" },
    { id: "perplexity", label: "Perplexity" },
    { id: "maps", label: "Maps" },
  ],
  rows: [
    { query: "Catering bakery near Hertel", cells: { chatgpt: "mentioned", google_ai: "mentioned", perplexity: "mentioned", maps: "mentioned" } },
    { query: "Wedding cake Buffalo", cells: { chatgpt: "mentioned", google_ai: "mentioned", maps: "mentioned" } },
    { query: "Sfogliatelle near me", cells: { chatgpt: "mentioned", google_ai: "mentioned", perplexity: "mentioned", maps: "mentioned" } },
    { query: "Bakery open Sunday", cells: { chatgpt: "mentioned", google_ai: "wrong_info_fixed", perplexity: "mentioned", maps: "mentioned" } },
    { query: "Gluten-free bakery Buffalo", cells: { maps: "mentioned" } },
    { query: "Office lunch catering", cells: { chatgpt: "mentioned", google_ai: "mentioned", maps: "mentioned" } },
  ],
  checkedAt: "2026-10-05T12:00:00Z",
};

/** Probing has run, but no assistant has data yet: the honest empty state. */
export const BAKERY_AI_MIRROR_EMPTY: AiMirrorData = {
  eyebrow: "When Buffalo asks AI",
  businessName: "Hertel Ave Bakery",
  mentionedCount: 0,
  total: 0,
  answer: null,
  assistants: [],
  rows: [],
};

const lead = (id: number, day: number, time: string, name: string, minutes: number): ReplyLead => ({ id: `lead-${id}`, day, time, name, minutes });

/** 23 leads, all answered within 5 minutes (median 4). */
export const BAKERY_LEADS: ReplyLead[] = [
  lead(1, 0, "10:12", "Maria", 4), lead(2, 0, "15:40", "Dev", 5),
  lead(3, 1, "8:55", "Ana", 2), lead(4, 1, "12:20", "Rob", 4), lead(5, 1, "17:05", "Lee", 3),
  lead(6, 2, "9:30", "Sam", 5), lead(7, 2, "14:10", "Kit", 4),
  lead(8, 3, "8:15", "Noor", 3), lead(9, 3, "9:41", "Jess", 2), lead(10, 3, "13:25", "Tom", 4), lead(11, 3, "18:02", "Ivy", 2),
  lead(12, 4, "10:48", "Paul", 5), lead(13, 4, "13:33", "Gia", 3), lead(14, 4, "16:20", "Ed", 4),
  lead(15, 5, "8:05", "Rae", 3), lead(16, 5, "9:50", "Jo", 2), lead(17, 5, "11:15", "Max", 3), lead(18, 5, "12:40", "Una", 5), lead(19, 5, "14:55", "Cal", 4),
  lead(20, 6, "9:10", "Liv", 3), lead(21, 6, "10:25", "Ben", 5), lead(22, 6, "11:45", "Zoe", 4), lead(23, 6, "13:30", "Ian", 2),
];

export const BAKERY_RATINGS: RatingPoint[] = [
  { label: "May", rating: 4.3 },
  { label: "Jun", rating: 4.38 },
  { label: "Jul", rating: 4.54 },
  { label: "Aug", rating: 4.6 },
  { label: "Sep", rating: 4.7 },
  { label: "Oct", rating: 4.8 },
];

export const BAKERY_REPORT: WeeklyReport = {
  place: "Hertel Ave",
  found: 412,
  booked: 9,
  earned: { amount: 1840, source: "Square" },
  messages: { total: 23, answered: 23, typicalMinutes: 4 },
  needsYou: { what: "the catering page", replyWord: "YES", effect: "put it live" },
};

export const BAKERY_PRICE_TERMS: PriceTerm[] = [
  { icon: "keep", title: "Yours to keep", detail: "page, customers, deposits" },
  { icon: "undo", title: "Undo any time", detail: "deposits taken stay safe" },
  { icon: "live", title: "Live Thursday", detail: "checked on a phone first" },
  { icon: "safe", title: "No surprises", detail: "no auto-renew, no revert on cancel" },
];

const RECEIPTS_FOR = (id: string) => `/preview/strelva/outcomes?location=${id}`;

/** Comfort Air, four locations, typical reply minutes Monday → Sunday. */
export const COMFORT_AIR_LOCATIONS: HeatmapRow[] = [
  { id: "lockport", name: "Lockport", days: [22, 40, 55, 190, 120, 75, 48], rating: 4.3, booked: 14, receiptsHref: RECEIPTS_FOR("lockport") },
  { id: "williamsville", name: "Williamsville", days: [12, 9, 18, 25, 14, 10, 11], rating: 4.6, booked: 22, receiptsHref: RECEIPTS_FOR("williamsville") },
  { id: "amherst", name: "Amherst", days: [4, 3, 6, 5, 4, 3, 4], rating: 4.7, booked: 31, receiptsHref: RECEIPTS_FOR("amherst") },
  { id: "elmwood", name: "Buffalo · Elmwood", days: [2, 3, 2, 2, 3, 2, 2], rating: 4.8, booked: 38, receiptsHref: RECEIPTS_FOR("elmwood") },
];
