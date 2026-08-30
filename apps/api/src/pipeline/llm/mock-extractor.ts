import type { IssueCategory, ReviewAnalysis, Severity } from '@rs/contracts';
import { SEVERITY_RANK } from '@rs/contracts';
import type { ExtractResult, Extractor } from './extractor';
import type { BatchItem } from './prompt';

interface Rule {
  category: IssueCategory;
  label: string;
  severity: Severity;
  pattern: RegExp;
}

/**
 * Deterministic keyword classifier used when no ANTHROPIC_API_KEY is present.
 *
 * It exists so the pipeline is runnable end to end from a clean clone with no
 * credentials, and so the unit tests never touch the network. It is NOT meant
 * to be as good as the model — `pnpm eval --mock` scores it against the same
 * gold labels, and the gap between the two columns is the point.
 */
const RULES: Rule[] = [
  { category: 'auth_access', label: 'locked out of account', severity: 'critical', pattern: /locked out|log(?:ged)? back in|can'?t log in|2fa|two-factor|reconnecter/i },
  { category: 'auth_access', label: 'password reset broken', severity: 'high', pattern: /password reset|reset email/i },
  { category: 'billing_charges', label: 'charged twice', severity: 'critical', pattern: /charged (?:me )?twice|cobraron dos veces|double charge/i },
  { category: 'billing_charges', label: 'billed after cancelling', severity: 'critical', pattern: /billed after|charged after i cancel/i },
  { category: 'billing_charges', label: 'refund not received', severity: 'critical', pattern: /refund|reembolso/i },
  { category: 'crashes_stability', label: 'lost work to a crash', severity: 'critical', pattern: /lose my work|lost my work/i },
  { category: 'crashes_stability', label: 'app crashes', severity: 'high', pattern: /crash|closes randomly|freez|unusable|st(?:ü|u)rzt|se cierra sola/i },
  { category: 'product_quality', label: 'arrived spoiled', severity: 'critical', pattern: /spoiled|ingredients were|estragado|arrived.*warm/i },
  { category: 'product_quality', label: 'component failed', severity: 'high', pattern: /stopped working after|left (?:ear)?bud/i },
  { category: 'battery_hardware', label: 'battery does not hold charge', severity: 'high', pattern: /hold a charge|battery dies|bateria acaba|case doesn'?t charge/i },
  { category: 'delivery_fulfillment', label: 'incomplete order', severity: 'high', pattern: /missing half|missing (?:an )?item/i },
  { category: 'delivery_fulfillment', label: 'delivery problem', severity: 'medium', pattern: /arrived a day late|left in the rain|pedido chegou|atrasado/i },
  { category: 'support_quality', label: 'support never replied', severity: 'high', pattern: /support never replied|nie geantwortet|won'?t respond|never replied/i },
  { category: 'support_quality', label: 'support too slow', severity: 'medium', pattern: /days to hear back|slow to respond/i },
  { category: 'support_quality', label: 'could not reach a human', severity: 'medium', pattern: /chatbot|reach a human|rude agent/i },
  { category: 'performance', label: 'slow to load', severity: 'medium', pattern: /takes forever|spinning? wheel|laggy|sync takes/i },
  { category: 'pricing_value', label: 'hidden fees', severity: 'medium', pattern: /hidden fees/i },
  { category: 'pricing_value', label: 'price increase', severity: 'medium', pattern: /price went up/i },
  { category: 'pricing_value', label: 'poor value for money', severity: 'medium', pattern: /too expensive|not worth|free tier|太贵/i },
  { category: 'ux_usability', label: 'confusing navigation', severity: 'medium', pattern: /too many taps|la(?:y|u)t is confusing|new layout|export button|dark mode/i },
  { category: 'missing_features', label: 'missing capability', severity: 'low', pattern: /web version|offline mode|bulk edit|recurring tasks|wish it had/i },
  { category: 'praise', label: 'positive feedback', severity: 'none', pattern: /love it|works great|time saver|exactly what i needed|design is gorgeous|best in its category|fixed it fast|很好用/i },
];

const SPAM = /bit\.ly|airdrop|crypto|make \$[\d,]+|click here|totally-legit|www\.|https?:\/\//i;

export class MockExtractor implements Extractor {
  readonly name = 'mock';
  readonly model = 'mock-keyword-v1';

  async extractBatch(items: readonly BatchItem[]): Promise<ExtractResult> {
    return {
      analyses: items.map((item) => analyse(item)),
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    };
  }
}

function analyse(item: BatchItem): ReviewAnalysis {
  const isSpam = SPAM.test(item.text);

  const matched = RULES.filter((rule) => rule.pattern.test(item.text));
  const seen = new Set<string>();
  const issues = matched
    .filter((rule) => {
      const key = `${rule.category}:${rule.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((rule) => ({
      category: rule.category,
      label: rule.label,
      quote: extractQuote(item.text, rule.pattern),
      severity: rule.severity,
    }));

  const problems = matched.filter((r) => r.category !== 'praise');
  const praised = matched.some((r) => r.category === 'praise');

  const severity: Severity = problems.length
    ? problems.reduce<Severity>(
        (worst, rule) =>
          SEVERITY_RANK[rule.severity] > SEVERITY_RANK[worst] ? rule.severity : worst,
        'low',
      )
    : 'none';

  const sentiment = isSpam
    ? 'neutral'
    : problems.length && praised
      ? 'mixed'
      : problems.length
        ? 'negative'
        : praised
          ? 'positive'
          : 'neutral';

  return {
    id: item.id,
    is_spam: isSpam,
    language: detectLanguage(item.text),
    sentiment,
    severity,
    issues: issues.length
      ? issues
      : [
          {
            category: 'other' as const,
            label: 'unclassified feedback',
            quote: item.text.slice(0, 120),
            severity: 'medium' as const,
          },
        ],
    summary_en: item.text.slice(0, 160),
    // Honest about itself: a keyword matcher should never claim high confidence.
    confidence: matched.length ? 0.5 : 0.2,
  };
}

/** Snaps to clause boundaries so a quote reads as a sentence, not a fragment. */
function extractQuote(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return text.slice(0, 120);

  const clauses = text.split(/(?<=[.!?])\s+|,\s+(?=(?:but|and|on top of that)\b)/i);
  let cursor = 0;
  for (const clause of clauses) {
    const end = cursor + clause.length;
    if (match.index >= cursor && match.index < end + 2) {
      return clause
        .replace(/^(?:first|on top of that|but|and),?\s*/i, '')
        .replace(/^[,\s]+/, '')
        .trim();
    }
    cursor = end + 1;
  }
  return text.slice(match.index, match.index + match[0].length + 30).trim();
}

function detectLanguage(text: string): string {
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/\b(?:pedido|chegou|acaba|muito|não|recomendo)\b/i.test(text)) return 'pt';
  if (/\b(?:cobraron|quiero|aplicación|cierra|cada vez que la)\b/i.test(text)) return 'es';
  if (/\b(?:die|der|und|stürzt|ständig|nie|enttäuschend|kundendienst)\b/i.test(text)) return 'de';
  if (/\b(?:impossible|reconnecter|après|mise à jour)\b/i.test(text)) return 'fr';
  return 'en';
}
