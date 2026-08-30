/**
 * The issue taxonomy is a CLOSED set on purpose.
 *
 * Free-form topic extraction fragments the same complaint into "login issues" /
 * "can't log in" / "auth problem", which makes a "top issues" count meaningless.
 * A closed set gives stable aggregation keys; `other` is the escape hatch and
 * doubles as a drift sensor — if it grows, the taxonomy needs another category.
 *
 * Categories were derived from the actual corpus: the 300 reviews contain ~102
 * distinct complaint/praise clauses which cluster cleanly into the buckets below.
 */

export const ISSUE_CATEGORIES = [
  'auth_access',
  'crashes_stability',
  'performance',
  'billing_charges',
  'pricing_value',
  'support_quality',
  'delivery_fulfillment',
  'product_quality',
  'battery_hardware',
  'ux_usability',
  'missing_features',
  'praise',
  'other',
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export interface IssueCategoryMeta {
  id: IssueCategory;
  /** Shown in the UI. */
  label: string;
  /** Given to the model verbatim — this is the classification instruction. */
  definition: string;
  /** Positive feedback is tracked but never counted as a problem. */
  positive: boolean;
}

export const ISSUE_TAXONOMY: readonly IssueCategoryMeta[] = [
  {
    id: 'auth_access',
    label: 'Login & account access',
    definition:
      'User cannot get into their account: locked out, 2FA loop, password reset email never arrives, login broken after an update.',
    positive: false,
  },
  {
    id: 'crashes_stability',
    label: 'Crashes & data loss',
    definition:
      'App crashes, freezes, closes unexpectedly, or the user loses work as a result.',
    positive: false,
  },
  {
    id: 'performance',
    label: 'Speed & performance',
    definition:
      'Slow load, long sync, lag, spinning wheel. The feature works but is unacceptably slow.',
    positive: false,
  },
  {
    id: 'billing_charges',
    label: 'Billing & refunds',
    definition:
      'Money moved incorrectly: charged twice, billed after cancelling, refund not received, unexpected charge.',
    positive: false,
  },
  {
    id: 'pricing_value',
    label: 'Pricing & value',
    definition:
      'The price itself is the complaint: too expensive, price increase, hidden fees, free tier gutted, not worth the subscription. Distinct from billing_charges, where a charge was wrong.',
    positive: false,
  },
  {
    id: 'support_quality',
    label: 'Customer support',
    definition:
      'Support was slow, unresponsive, rude, or unreachable (useless chatbot, no human).',
    positive: false,
  },
  {
    id: 'delivery_fulfillment',
    label: 'Delivery & order accuracy',
    definition:
      'Shipping and order problems: late delivery, missing items, wrong items, package mishandled.',
    positive: false,
  },
  {
    id: 'product_quality',
    label: 'Product quality',
    definition:
      'The physical goods are defective or spoiled on arrival, or a component failed. Excludes battery-specific faults.',
    positive: false,
  },
  {
    id: 'battery_hardware',
    label: 'Battery & charging',
    definition:
      'Battery life, charging, or charging-case faults specifically.',
    positive: false,
  },
  {
    id: 'ux_usability',
    label: 'Usability & navigation',
    definition:
      'Confusing layout, too many steps, unreadable dark mode, a feature that became hard to find. The feature exists but is hard to use.',
    positive: false,
  },
  {
    id: 'missing_features',
    label: 'Missing features',
    definition:
      'A capability the user wants does not exist: no web version, no offline mode, no bulk edit, no recurring tasks.',
    positive: false,
  },
  {
    id: 'praise',
    label: 'Positive feedback',
    definition:
      'Genuine praise: works well, saves time, good design, support resolved it quickly.',
    positive: true,
  },
  {
    id: 'other',
    label: 'Other',
    definition:
      'Substantive feedback that fits none of the categories above. Use sparingly — never as a dumping ground for a review you did not read carefully.',
    positive: false,
  },
] as const;

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> =
  Object.fromEntries(ISSUE_TAXONOMY.map((c) => [c.id, c.label])) as Record<
    IssueCategory,
    string
  >;

export const POSITIVE_CATEGORIES: ReadonlySet<IssueCategory> = new Set(
  ISSUE_TAXONOMY.filter((c) => c.positive).map((c) => c.id),
);

/**
 * Severity is anchored to CONSEQUENCE FOR THE USER, not to the tone of the
 * review. Without an explicit rubric the model's severity is arbitrary and the
 * eval measures nothing.
 */
export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'none'] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export const SEVERITY_RUBRIC: Record<Severity, string> = {
  critical:
    'The user is blocked out or lost money, data, or something unsafe happened: cannot access their account at all, charged twice or billed after cancelling, lost work to a crash, spoiled food, a dead product.',
  high: 'A core function is broken but a workaround exists: repeated crashes, sync failing, missing items from an order, support never replied at all.',
  medium:
    'Noticeable degradation of the experience: slow performance, confusing UI, price complaints, a single late delivery.',
  low: 'Minor annoyance or a feature wish: needs a web version, wish it had X, cosmetic problems.',
  none: 'No problem reported — purely positive or neutral feedback.',
};

/** Ordinal rank, used by the eval for "within one level" agreement and by sorting. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

export const SENTIMENTS = ['positive', 'neutral', 'mixed', 'negative'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const SENTIMENT_GUIDANCE: Record<Sentiment, string> = {
  positive: 'Overall satisfied, no material complaint.',
  neutral: 'No clear leaning, or purely factual.',
  mixed: 'Genuine praise AND a genuine complaint in the same review.',
  negative: 'Overall dissatisfied.',
};

/** The five channels the reviews were pulled from. */
export const SOURCES = [
  'app_store',
  'google_play',
  'trustpilot',
  'post_purchase_email',
  'support_chat',
] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<Source, string> = {
  app_store: 'App Store',
  google_play: 'Google Play',
  trustpilot: 'Trustpilot',
  post_purchase_email: 'Post-purchase email',
  support_chat: 'Support chat',
};

/**
 * Why a review was excluded from aggregation. Kept as data (not a boolean) so
 * the UI can show the user exactly what was dropped and why.
 */
export const REVIEW_STATUSES = ['ok', 'junk', 'spam', 'duplicate'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  ok: 'Counted',
  junk: 'No content',
  spam: 'Spam',
  duplicate: 'Duplicate cross-post',
};
