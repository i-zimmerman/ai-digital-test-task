import type { Sentiment, Severity } from '@rs/contracts';

/**
 * Severity is the only thing in this interface that uses colour to carry
 * meaning, so the mapping is defined once and reused by the badge, the
 * distribution bar and the issue chips inside a review.
 */
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'none'];

/** Levels offered as a filter — "none" is not a problem anyone filters for. */
export const FILTERABLE_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No issue',
};

/** Solid fill — used for the distribution bar. */
export const SEVERITY_FILL: Record<Severity, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
  none: 'bg-sev-none',
};

/** Tinted background + readable text — used for badges and chips. */
export const SEVERITY_CHIP: Record<Severity, string> = {
  critical: 'bg-sev-critical-soft text-sev-critical-text',
  high: 'bg-sev-high-soft text-sev-high-text',
  medium: 'bg-sev-medium-soft text-sev-medium-text',
  low: 'bg-sev-low-soft text-sev-low-text',
  none: 'bg-sev-none-soft text-sev-none-text',
};

/** A single dot, for legends and dense rows. */
export const SEVERITY_DOT: Record<Severity, string> = SEVERITY_FILL;

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  negative: 'Negative',
  mixed: 'Mixed',
  neutral: 'Neutral',
  positive: 'Positive',
};

export const SENTIMENT_CHIP: Record<Sentiment, string> = {
  negative: 'bg-sev-critical-soft text-sev-critical-text',
  mixed: 'bg-sev-high-soft text-sev-high-text',
  neutral: 'bg-muted text-muted-foreground',
  positive: 'bg-sev-none-soft text-sev-none-text',
};
