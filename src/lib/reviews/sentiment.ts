/**
 * Review sentiment analysis — lightweight, dependency-free NLP.
 *
 * Ported + typed from the archived OWSH Systems `sentiment-analyzer` service.
 * Lexicon + heuristic scoring (no external API): negation-aware, intensifier-
 * aware, with topic/keyword/urgency/emotion extraction. Used by the review
 * intelligence layer to power the client's "customers love X" numbers and the
 * admin's "these need attention" queue — see `intelligence.ts`.
 *
 * Deterministic and synchronous: safe to run per-review inside the weekly
 * report and the Reviews dashboard without a model call.
 */

export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";
export type Urgency = "high" | "medium" | "low";
export type ReviewTopic =
  | "service"
  | "price"
  | "quality"
  | "wait_time"
  | "location"
  | "cleanliness"
  | "atmosphere"
  | "food";
export type Emotion =
  | "happy"
  | "angry"
  | "frustrated"
  | "grateful"
  | "disappointed"
  | "surprised"
  | "neutral";

export interface Sentiment {
  /** -1 (most negative) … 1 (most positive). */
  score: number;
  label: SentimentLabel;
  /** 0 … 1 — how much sentiment signal the text carried. */
  confidence: number;
}

export interface ReviewAnalysis {
  sentiment: Sentiment;
  topics: ReviewTopic[];
  keywords: string[];
  urgency: Urgency;
  emotion: Emotion;
  rating: number;
  /** True when the review warrants an owner reply (low rating, negative, or urgent). */
  needsResponse: boolean;
}

const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "awesome", "fantastic", "wonderful",
  "outstanding", "incredible", "perfect", "best", "love", "loved", "loving",
  "beautiful", "brilliant", "superb", "exceptional", "remarkable", "terrific",
  "fabulous", "delightful", "pleasant", "enjoyable", "satisfying", "satisfied",
  "happy", "pleased", "impressed", "recommend", "recommended", "recommending",
  "helpful", "friendly", "professional", "courteous", "polite", "attentive",
  "responsive", "efficient", "quick", "fast", "prompt", "punctual", "reliable",
  "trustworthy", "honest", "knowledgeable", "skilled", "expert", "experienced",
  "accommodating", "welcoming", "warm", "caring", "patient", "thorough",
  "quality", "clean", "fresh", "delicious", "tasty", "yummy", "flavorful",
  "authentic", "genuine", "premium", "top-notch", "first-class", "first-rate",
  "high-quality", "well-made", "well-done", "meticulous", "detailed",
  "affordable", "reasonable", "fair", "worth", "value", "bargain", "deal",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "awful", "horrible", "worst", "hate", "hated", "hating",
  "disappointing", "disappointed", "disappoints", "poor", "mediocre", "subpar",
  "unacceptable", "disgraceful", "dreadful", "pathetic", "useless", "waste",
  "regret", "regretted", "mistake", "avoid", "nightmare", "disaster",
  "rude", "impolite", "unprofessional", "unfriendly", "unhelpful", "slow",
  "late", "delayed", "ignored", "neglected", "dismissive", "careless",
  "incompetent", "inexperienced", "unreliable", "dishonest", "scam", "fraud",
  "pushy", "aggressive", "condescending", "arrogant", "apathetic",
  "dirty", "unclean", "filthy", "stale", "expired", "broken", "damaged",
  "defective", "faulty", "cheap", "flimsy", "shoddy", "low-quality",
  "disgusting", "gross", "nasty", "inedible", "bland", "tasteless",
  "overpriced", "expensive", "ripoff", "rip-off", "scammed", "cheated",
  "problem", "problems", "issue", "issues", "complaint", "complaints",
  "error", "errors", "wrong", "incorrect", "missing", "failed",
]);

const NEGATION_WORDS = new Set([
  "not", "no", "n't", "never", "none", "nobody", "nothing", "neither",
  "nowhere", "hardly", "barely", "scarcely", "without", "doesn't", "don't",
  "didn't", "won't", "wouldn't", "couldn't", "shouldn't", "isn't", "aren't",
  "wasn't", "weren't", "haven't", "hasn't", "hadn't",
]);

const INTENSIFIER_WORDS: Record<string, number> = {
  very: 1.5, really: 1.5, extremely: 2.0, incredibly: 2.0, absolutely: 2.0,
  completely: 1.8, totally: 1.8, highly: 1.5, super: 1.5, so: 1.3,
  quite: 1.2, pretty: 1.1, somewhat: 0.8, slightly: 0.5, barely: 0.3, hardly: 0.3,
};

const TOPIC_PATTERNS: Record<ReviewTopic, RegExp> = {
  service: /\b(service|staff|employee|server|waiter|waitress|manager|team|help|helped|helping|assistance|customer\s*service)\b/i,
  price: /\b(price|pricing|cost|expensive|cheap|affordable|value|money|worth|pay|paid|charge|fee|bill)\b/i,
  quality: /\b(quality|fresh|taste|tasty|delicious|flavor|product|material|craftsmanship|workmanship)\b/i,
  wait_time: /\b(wait|waiting|waited|long|slow|fast|quick|prompt|delay|delayed|time|hour|minute)\b/i,
  location: /\b(location|parking|access|find|found|directions|area|neighborhood|convenient|inconvenient)\b/i,
  cleanliness: /\b(clean|dirty|neat|messy|hygiene|sanitary|spotless|filthy|tidy|organized)\b/i,
  atmosphere: /\b(atmosphere|ambiance|vibe|environment|decor|music|noise|quiet|loud|cozy|comfortable)\b/i,
  food: /\b(food|meal|dish|dishes|menu|portion|portions|entree|appetizer|dessert|drink|drinks|beverage)\b/i,
};

const URGENCY_HIGH: RegExp[] = [
  /\b(health\s*(hazard|risk|concern|code)|safety\s*(issue|concern|hazard))\b/i,
  /\b(report(ed|ing)?|sue|lawsuit|lawyer|attorney|legal\s*action)\b/i,
  /\b(food\s*poisoning|got\s*sick|made\s*me\s*sick|allergic\s*reaction)\b/i,
  /\b(discrimination|harassment|racist|sexist)\b/i,
  /\b(refund|charged\s*(me\s*)?(twice|extra|wrong)|stolen|theft|fraud)\b/i,
  /\b(never\s*(going\s*)?back|do\s*not\s*go|stay\s*away|warning)\b/i,
  /\b(worst\s*(experience|place|ever)|absolute(ly)?\s*terrible)\b/i,
];

const URGENCY_MEDIUM: RegExp[] = [
  /\b(disappointed|frustrat(ed|ing)|upset|angry|annoyed)\b/i,
  /\b(manager|supervisor|complain(t|ed|ing)?)\b/i,
  /\b(mistake|error|wrong\s*order|incorrect)\b/i,
  /\b(rude|unprofessional|disrespect(ful)?)\b/i,
];

const EMOTION_PATTERNS: Array<[Emotion, RegExp]> = [
  ["happy", /\b(happy|delighted|thrilled|pleased|joy|joyful|ecstatic|elated)\b/i],
  ["angry", /\b(angry|furious|outraged|livid|infuriated|mad|pissed)\b/i],
  ["frustrated", /\b(frustrated|frustrating|annoyed|annoying|irritated|bothered)\b/i],
  ["grateful", /\b(grateful|thankful|appreciate|appreciated|appreciation|thanks)\b/i],
  ["disappointed", /\b(disappointed|disappointing|letdown|let\s*down|underwhelmed)\b/i],
  ["surprised", /\b(surprised|unexpected|shock(ed)?|amazed|blown\s*away)\b/i],
];

const SENTENCE_ENDINGS = new Set([".", "!", "?", ";", ":"]);

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "must", "shall", "can", "need", "it", "its", "this", "that", "these",
  "those", "i", "you", "he", "she", "we", "they", "me", "him", "her", "us",
  "them", "my", "your", "his", "our", "their", "what", "which", "who", "whom",
  "when", "where", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "also", "now", "here", "there", "then",
  "once", "if", "because", "until", "while", "about", "into", "through",
  "during", "before", "after", "above", "below", "between", "under", "again",
  "further", "get", "got", "go", "went", "going",
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/([.!?;:])/g, " $1 ")
    .replace(/[^\w\s'.\-!?;:]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export function analyzeSentiment(text: string): Sentiment {
  if (!text || typeof text !== "string") {
    return { score: 0, label: "neutral", confidence: 0 };
  }
  const words = tokenize(text);
  if (words.length === 0) return { score: 0, label: "neutral", confidence: 0 };

  let positiveScore = 0;
  let negativeScore = 0;
  let multiplier = 1;
  let isNegated = false;

  for (const word of words) {
    // Negation + intensifier scope resets at sentence boundaries.
    if (SENTENCE_ENDINGS.has(word)) {
      isNegated = false;
      multiplier = 1;
      continue;
    }
    if (NEGATION_WORDS.has(word)) {
      isNegated = true;
      continue;
    }
    if (INTENSIFIER_WORDS[word]) {
      multiplier = INTENSIFIER_WORDS[word];
      continue;
    }
    if (POSITIVE_WORDS.has(word)) {
      if (isNegated) negativeScore += multiplier;
      else positiveScore += multiplier;
      multiplier = 1;
      continue;
    }
    if (NEGATIVE_WORDS.has(word)) {
      if (isNegated) positiveScore += 0.5 * multiplier; // negated negative = weakly positive
      else negativeScore += multiplier;
      multiplier = 1;
      continue;
    }
    multiplier = 1;
  }

  const totalScore = positiveScore - negativeScore;
  const maxPossible = Math.max(positiveScore + negativeScore, 1);
  const normalized = Math.max(-1, Math.min(1, totalScore / Math.max(maxPossible, 3)));

  let label: SentimentLabel;
  if (normalized >= 0.3) label = "positive";
  else if (normalized <= -0.3) label = "negative";
  else if (positiveScore > 0 && negativeScore > 0) label = "mixed";
  else label = "neutral";

  const signalStrength = positiveScore + negativeScore;
  const confidence = Math.min(1, signalStrength / 5);

  return {
    score: Math.round(normalized * 1000) / 1000,
    label,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export function extractTopics(text: string): ReviewTopic[] {
  if (!text) return [];
  const topics: ReviewTopic[] = [];
  for (const key of Object.keys(TOPIC_PATTERNS) as ReviewTopic[]) {
    if (TOPIC_PATTERNS[key].test(text)) topics.push(key);
  }
  return topics;
}

export function extractKeywords(text: string, maxKeywords = 5): string[] {
  if (!text) return [];
  const freq: Record<string, number> = {};
  for (const word of tokenize(text)) {
    if (word.length > 2 && !STOP_WORDS.has(word)) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

export function assessUrgency(sentiment: Sentiment, rating: number, text: string): Urgency {
  for (const pattern of URGENCY_HIGH) {
    if (pattern.test(text)) return "high";
  }
  if (rating === 1 && sentiment.label === "negative" && sentiment.score < -0.5) {
    return "high";
  }
  for (const pattern of URGENCY_MEDIUM) {
    if (pattern.test(text)) return "medium";
  }
  if (rating <= 2 || sentiment.label === "negative") return "medium";
  return "low";
}

export function detectEmotion(text: string): Emotion {
  if (!text) return "neutral";
  for (const [emotion, pattern] of EMOTION_PATTERNS) {
    if (pattern.test(text)) return emotion;
  }
  return "neutral";
}

export function analyzeReview(text: string, rating = 3): ReviewAnalysis {
  const sentiment = analyzeSentiment(text);
  const topics = extractTopics(text);
  const keywords = extractKeywords(text);
  const urgency = assessUrgency(sentiment, rating, text);
  const emotion = detectEmotion(text);
  return {
    sentiment,
    topics,
    keywords,
    urgency,
    emotion,
    rating,
    needsResponse: rating <= 3 || sentiment.label === "negative" || urgency !== "low",
  };
}

/** Human-readable label for a topic, for use in owner-facing copy. */
export const TOPIC_LABELS: Record<ReviewTopic, string> = {
  service: "service",
  price: "pricing",
  quality: "quality",
  wait_time: "wait times",
  location: "location & parking",
  cleanliness: "cleanliness",
  atmosphere: "atmosphere",
  food: "food",
};
