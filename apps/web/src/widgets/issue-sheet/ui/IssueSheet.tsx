import { ISSUE_CATEGORY_LABEL, type IssueCategory } from '@rs/contracts';
import { ReviewCard } from '@/entities/review/ui/ReviewCard';
import { useIssueReviews } from '@/entities/review/api/queries';
import type { IssueQueryParams } from '@/entities/issue/api/queries';
import { humanise, plural, shortProduct } from '@/shared/lib/format';
import { SEVERITY_LABEL } from '@/shared/config/severity';
import { ScrollArea } from '@/shared/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

interface Props {
  category: IssueCategory | null;
  params: IssueQueryParams;
  onClose: () => void;
}

/** The click-through: every review that produced the selected issue. */
export function IssueSheet({ category, params, onClose }: Props) {
  const { data, isLoading, error } = useIssueReviews(category, params);

  const context = [
    params.product && shortProduct(params.product),
    params.severity && `${SEVERITY_LABEL[params.severity]} severity`,
    params.source && humanise(params.source),
  ].filter(Boolean);

  return (
    <Sheet
      open={category !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 gap-1 border-b px-5 py-4">
          <SheetTitle className="text-base">
            {category ? ISSUE_CATEGORY_LABEL[category] : ''}
          </SheetTitle>
          <SheetDescription>
            {data
              ? `${plural(data.length, 'review')} behind this issue`
              : 'Loading the reviews behind this issue'}
            {context.length > 0 && ` · ${context.join(' · ')}`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-5">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-44 rounded-xl" />
              ))}

            {error && (
              <p className="text-sm text-destructive">
                Could not load these reviews.
              </p>
            )}

            {data?.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
