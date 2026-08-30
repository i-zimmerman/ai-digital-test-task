import { CircleAlert, Copy, MessageSquareText, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStats } from '@/entities/stats/api/queries';
import { cn } from '@/shared/lib/cn';
import { languageName, percent } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

export function StatsHeader({ onShowExcluded }: { onShowExcluded: () => void }) {
  const { data, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[6.5rem] rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        Could not load the corpus summary — is the API running on port 3001?
      </div>
    );
  }

  const removed = data.junk + data.spam + data.duplicates;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={MessageSquareText}
          value={String(data.analysed)}
          label="Reviews in this report"
          hint={`${data.totalReviews} collected, ${removed} set aside`}
        />
        <StatCard
          icon={Copy}
          value={String(data.duplicates)}
          label="Cross-posts merged"
          hint={`${data.duplicateClusters} people posted the same thing twice or more`}
        />
        <StatCard
          icon={Trash2}
          value={String(data.spam + data.junk)}
          label="Spam & empty removed"
          hint={`${data.spam} promotional, ${data.junk} with no content`}
        />
        {data.ratingContradictionRate !== null && (
          <StatCard
            icon={CircleAlert}
            accent
            value={percent(data.ratingContradictionRate)}
            label="Star ratings that contradict the text"
            hint="Sentiment is read from the words, never the stars"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">Languages</span>
          {data.languages.map((lang) => (
            <Tooltip key={lang.code}>
              <TooltipTrigger asChild>
                <span className="tabular cursor-default rounded-md border bg-card px-1.5 py-0.5">
                  {lang.code} {lang.count}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {lang.count} in {languageName(lang.code)}
              </TooltipContent>
            </Tooltip>
          ))}
          <span className="opacity-70">— all classified, none dropped</span>
        </span>

        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={onShowExcluded}
        >
          See the {removed} reviews that were set aside
        </Button>

        {data.lastRun && (
          <span className="ml-auto opacity-70">
            {data.lastRun.model} · prompt {data.lastRun.promptVersion}
            {data.lastRun.estimatedCostUsd > 0 &&
              ` · $${data.lastRun.estimatedCostUsd.toFixed(2)}`}
          </span>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  accent,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card px-4 py-3.5',
        // The rating-contradiction card is a finding, not a count — it gets a tint.
        accent && 'border-sev-high/30 bg-sev-high-soft/40',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn('size-3.5', accent && 'text-sev-high-text')} />
        {label}
      </div>
      <div
        className={cn(
          'tabular mt-2 text-3xl leading-none font-semibold',
          accent && 'text-sev-high-text',
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
