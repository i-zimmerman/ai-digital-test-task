import type { ReviewDetail } from '@rs/contracts';
import { ISSUE_CATEGORY_LABEL } from '@rs/contracts';
import { Languages, Share2, Star, TriangleAlert } from 'lucide-react';
import { SeverityBadge } from '@/entities/issue/ui/SeverityBadge';
import { cn } from '@/shared/lib/cn';
import {
  SENTIMENT_CHIP,
  SENTIMENT_LABEL,
  SEVERITY_CHIP,
  SEVERITY_FILL,
} from '@/shared/config/severity';
import {
  humanise,
  languageName,
  ratingContradictsText,
  shortProduct,
} from '@/shared/lib/format';

export function ReviewCard({ review }: { review: ReviewDetail }) {
  const crossPosts = review.alsoPostedOn.filter((p) => p.reviewId !== review.id);
  const detected = (review.languageDetected ?? review.language).toLowerCase();
  const isTranslated = detected !== 'en';
  const ratingIsOdd = ratingContradictsText(review.rating, review.sentiment);
  const lowConfidence = review.confidence !== null && review.confidence < 0.6;

  return (
    <article className="rounded-xl border bg-card transition-colors hover:border-foreground/15">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-4 py-2.5 text-xs">
        <span className="font-medium">{shortProduct(review.product)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{humanise(review.source)}</span>

        {isTranslated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
            <Languages className="size-3" />
            {languageName(detected)}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {review.rating !== null && (
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular',
                ratingIsOdd
                  ? 'font-medium text-sev-high-text'
                  : 'text-muted-foreground',
              )}
              title={
                ratingIsOdd
                  ? 'This star rating disagrees with the text of the review'
                  : undefined
              }
            >
              {ratingIsOdd ? (
                <TriangleAlert className="size-3" />
              ) : (
                <Star className="size-3" />
              )}
              {review.rating}
            </span>
          )}
          {review.sentiment && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-medium',
                SENTIMENT_CHIP[review.sentiment],
              )}
            >
              {SENTIMENT_LABEL[review.sentiment]}
            </span>
          )}
          {review.severity && <SeverityBadge severity={review.severity} />}
        </span>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-pretty">{review.text}</p>

        {isTranslated && review.summaryEn && (
          <p className="border-l-2 border-muted-foreground/30 pl-3 text-sm leading-relaxed text-muted-foreground">
            {review.summaryEn}
          </p>
        )}

        {review.issues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {review.issues.map((issue, index) => (
              <span
                key={`${issue.category}-${index}`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                  SEVERITY_CHIP[issue.severity],
                )}
              >
                <span
                  className={cn('size-1.5 rounded-full', SEVERITY_FILL[issue.severity])}
                />
                <span className="font-medium">
                  {ISSUE_CATEGORY_LABEL[issue.category]}
                </span>
                <span className="opacity-70">{issue.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
        <code className="font-mono opacity-70">{review.id}</code>

        {crossPosts.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Share2 className="size-3" />
            also posted on {crossPosts.map((p) => humanise(p.source)).join(', ')}
          </span>
        )}

        {review.confidence !== null && (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1 tabular',
              lowConfidence && 'font-medium text-sev-high-text',
            )}
            title={
              lowConfidence
                ? 'The model was unsure about this one — worth a human read'
                : undefined
            }
          >
            {lowConfidence && <TriangleAlert className="size-3" />}
            {(review.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>
    </article>
  );
}
