import { REVIEW_STATUS_LABEL, type ReviewStatus } from '@rs/contracts';
import { useExcludedReviews, type ExcludedReview } from '@/entities/stats/api/queries';
import { cn } from '@/shared/lib/cn';
import { humanise, plural, shortProduct } from '@/shared/lib/format';
import { ScrollArea } from '@/shared/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

const STATUS_STYLE: Record<string, string> = {
  spam: 'bg-sev-critical-soft text-sev-critical-text',
  junk: 'bg-sev-high-soft text-sev-high-text',
  duplicate: 'bg-sev-medium-soft text-sev-medium-text',
};

const STATUS_ORDER: ReviewStatus[] = ['spam', 'junk', 'duplicate'];

/**
 * Every review the pipeline removed, with the reason.
 *
 * A report that quietly drops 26 of 300 rows asks to be trusted. One that hands
 * you the 26 and says why can be checked, which is the whole point.
 */
export function ExcludedSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useExcludedReviews(isOpen);

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    rows: (data ?? []).filter((row) => row.status === status),
  })).filter((group) => group.rows.length > 0);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <SheetHeader className="shrink-0 gap-1 border-b px-5 py-4">
          <SheetTitle className="text-base">What was set aside, and why</SheetTitle>
          <SheetDescription>
            None of this is counted in the issue report.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-5">
            {isLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-40 rounded-xl" />
              ))}

            {grouped.map((group) => (
              <section key={group.status} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      STATUS_STYLE[group.status],
                    )}
                  >
                    {REVIEW_STATUS_LABEL[group.status]}
                  </span>
                  <span className="text-muted-foreground">
                    {plural(group.rows.length, 'review')}
                  </span>
                </h3>

                <div className="divide-y overflow-hidden rounded-xl border bg-card">
                  {group.rows.map((row) => (
                    <ExcludedRow key={row.id} row={row} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ExcludedRow({ row }: { row: ExcludedReview }) {
  const text = row.text.trim();

  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {text || <em className="text-muted-foreground">(empty)</em>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {shortProduct(row.product)} · {humanise(row.source)}
        </p>
      </div>
      <p className="max-w-64 text-right text-xs text-muted-foreground">{row.reason}</p>
    </div>
  );
}
