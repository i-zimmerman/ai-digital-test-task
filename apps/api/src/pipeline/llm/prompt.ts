import {
  ISSUE_TAXONOMY,
  SENTIMENT_GUIDANCE,
  SEVERITY_RUBRIC,
} from '@rs/contracts';

export interface BatchItem {
  id: string;
  product: string;
  source: string;
  text: string;
}

/**
 * The system prompt is a pure function of the taxonomy — no timestamps, no ids,
 * no per-batch content. That keeps it byte-identical across every call in a run
 * so prompt caching actually hits.
 */
export function buildSystemPrompt(): string {
  const taxonomy = ISSUE_TAXONOMY.map(
    (c) => `- ${c.id}: ${c.definition}`,
  ).join('\n');

  const severity = Object.entries(SEVERITY_RUBRIC)
    .map(([level, text]) => `- ${level}: ${text}`)
    .join('\n');

  const sentiment = Object.entries(SENTIMENT_GUIDANCE)
    .map(([level, text]) => `- ${level}: ${text}`)
    .join('\n');

  return `You are a customer-feedback analyst. You are given a batch of customer reviews and you return one structured analysis per review.

## Issue categories

Assign every issue raised in a review to exactly one of these ids. This list is closed — do not invent new ids.

${taxonomy}

## Severity

Severity describes the CONSEQUENCE FOR THE USER, not how angry the review sounds. A politely worded "I've been charged twice" is critical; an furious "the new icon is ugly" is low.

${severity}

Give EVERY issue its own severity, judged on its own. Then set the review's severity to the worst of them. A review can be critical overall while one of its issues is low: "billed after I cancelled, and I wish it had dark mode" is critical as a whole, but the dark-mode issue is low.

## Sentiment

${sentiment}

## Rules

1. A review can raise several issues — reviews in this corpus often use "First, ... On top of that, ...". Return one entry per distinct issue, up to 5. A review with no issue at all (pure praise) still gets a "praise" entry.
2. Every "quote" must be a VERBATIM substring of the review text, copied exactly, covering just the part that supports that issue. Never paraphrase, never translate a quote. For a non-English review, quote the original language.
3. "label" is a short human-readable phrase (2-6 words) naming the specific complaint, e.g. "battery dies within an hour". It is for display; the category is what gets counted.
4. Reviews are in several languages. Classify non-English reviews exactly as you would English ones — never skip one. "language" is the ISO 639-1 code you detect from the text itself.
5. "summary_en" is one short English sentence capturing the review, always filled in, including for English reviews.
6. is_spam is true only for promotional or scam content with no genuine feedback about the product — crypto airdrops, work-from-home offers, link farms. A negative review complaining about a "free tier" is NOT spam.
7. "confidence" is your own 0-1 confidence in this analysis. Use below 0.6 when the review is ambiguous, very short, or you had to guess.
8. Use the "other" category only when a review genuinely raises something no category covers. If you find yourself using it often, prefer the closest real category.
9. Return exactly one analysis per input review, with the same "id". Do not merge, drop, or reorder reviews.

## Worked examples

Review: "Not happy. First, crashes every time I open it. On top of that, support never replied. Fix this."
-> sentiment negative, severity high, issues: crashes_stability (severity high, "crashes on every launch", quote "crashes every time I open it"), support_quality (severity high, "support never responded", quote "support never replied").

Review: "It's okay. Customer support fixed it fast, but not worth teh subscription."
-> sentiment mixed, severity medium, issues: praise (severity none, "support resolved it quickly", quote "Customer support fixed it fast"), pricing_value (severity medium, "not worth the subscription price", quote "not worth teh subscription").

Review: "Me cobraron dos veces este mes, quiero un reembolso."
-> language es, sentiment negative, severity critical, issues: billing_charges (severity critical, "charged twice in one month", quote "Me cobraron dos veces este mes"), summary_en "Charged twice this month and wants a refund."`;
}

/**
 * Star ratings are deliberately NOT shown to the model.
 *
 * In this dataset 29% of rated reviews carry a rating that contradicts their own
 * text (a 5-star "Really disappointed... billed after I cancelled"). Feeding it
 * in would only anchor the model on a misleading signal. Product and channel ARE
 * included: they disambiguate complaints like "won't hold a charge".
 */
export function buildUserPrompt(items: readonly BatchItem[]): string {
  const payload = items.map((item) => ({
    id: item.id,
    product: item.product,
    channel: item.source,
    text: item.text,
  }));

  return `Analyse these ${items.length} reviews. Return one analysis per review, in the same order.

${JSON.stringify(payload, null, 2)}`;
}
