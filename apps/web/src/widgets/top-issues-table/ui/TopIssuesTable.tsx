import { ISSUE_CATEGORY_LABEL, type IssueCategory, type TopIssue } from '@rs/contracts';
import { ChevronRight, SearchX } from 'lucide-react';
import { SeverityBadge } from '@/entities/issue/ui/SeverityBadge';
import { SeverityBar } from '@/entities/issue/ui/SeverityBar';
import { useTopIssues, type IssueQueryParams } from '@/entities/issue/api/queries';
import { cn } from '@/shared/lib/cn';
import { shortProduct, topEntries } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

interface Props {
  params: IssueQueryParams;
  onSelect: (category: IssueCategory) => void;
}

export function TopIssuesTable({ params, onSelect }: Props) {
  const { data, isLoading, error } = useTopIssues(params);

  if (isLoading) return <TableSkeleton />;

  if (error) {
    return (
      <EmptyState
        title="Could not load the issues"
        body="The API did not answer. Check that it is running on port 3001."
      />
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Nothing matches these filters"
        body="Try clearing one of them, or include praise to see what people liked."
      />
    );
  }

  const maxMentions = Math.max(...data.map((issue) => issue.mentionCount));

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Fixed layout: without it the quote column steals width and the rest collapse. */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[19rem] pl-5">Issue</TableHead>
            <TableHead className="w-24">People</TableHead>
            <TableHead className="w-40">Severity spread</TableHead>
            <TableHead className="w-[6.5rem]">Worst case</TableHead>
            <TableHead className="w-52">Products</TableHead>
            <TableHead className="min-w-72">What people said</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((issue, index) => (
            <IssueRow
              key={issue.category}
              issue={issue}
              rank={index + 1}
              maxMentions={maxMentions}
              onSelect={onSelect}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IssueRow({
  issue,
  rank,
  maxMentions,
  onSelect,
}: {
  issue: TopIssue;
  rank: number;
  maxMentions: number;
  onSelect: (category: IssueCategory) => void;
}) {
  const products = topEntries(issue.productMix, 2);
  const rest = topEntries(issue.productMix, 99).slice(2);

  return (
    <TableRow
      className="group cursor-pointer"
      tabIndex={0}
      role="button"
      aria-label={`Open the ${ISSUE_CATEGORY_LABEL[issue.category]} reviews`}
      onClick={() => onSelect(issue.category)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(issue.category);
        }
      }}
    >
      <TableCell className="py-3.5 pl-5">
        <div className="flex items-baseline gap-3">
          <span className="tabular w-4 shrink-0 text-sm text-muted-foreground/50">
            {rank}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">
              {ISSUE_CATEGORY_LABEL[issue.category]}
            </div>
            <div className="truncate text-sm text-muted-foreground">{issue.label}</div>
          </div>
        </div>
      </TableCell>

      <TableCell className="py-3.5">
        <div className="flex items-baseline gap-1.5">
          <span className="tabular text-xl leading-none font-semibold">
            {issue.mentionCount}
          </span>
          {issue.mentionCount !== issue.reviewCount && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="tabular cursor-default text-xs text-muted-foreground">
                  ({issue.reviewCount})
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {issue.reviewCount} distinct reviews, {issue.mentionCount} counting
                cross-posts
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {/* Counts are hard to compare down a column; the rule makes gaps visible. */}
        <div className="mt-2 h-1 w-14 rounded-full bg-muted">
          <div
            className="h-1 rounded-full bg-foreground/30"
            style={{ width: `${(issue.mentionCount / maxMentions) * 100}%` }}
          />
        </div>
      </TableCell>

      <TableCell className="py-3.5">
        <SeverityBar mix={issue.severityMix} />
      </TableCell>

      <TableCell className="py-3.5">
        <SeverityBadge severity={issue.worstSeverity} />
      </TableCell>

      <TableCell className="py-3.5">
        <div className="flex flex-wrap items-center gap-1">
          {products.map(([product, count]) => (
            <Badge key={product} variant="outline" className="gap-1 rounded-md px-1.5 font-normal">
              {shortProduct(product)}
              <span className="tabular text-muted-foreground">{count}</span>
            </Badge>
          ))}
          {rest.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default px-1 text-xs whitespace-nowrap text-muted-foreground">
                  +{rest.length} more
                </span>
              </TooltipTrigger>
              <TooltipContent className="flex flex-col gap-0.5">
                {rest.map(([product, count]) => (
                  <span key={product} className="text-xs">
                    {shortProduct(product)} · {count}
                  </span>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>

      <TableCell className="py-3.5">
        <div className="space-y-1">
          {issue.examples.map((example) => (
            <p
              key={example.reviewId}
              className="truncate border-l-2 pl-2.5 text-sm text-muted-foreground italic"
            >
              {example.quote}
            </p>
          ))}
        </div>
      </TableCell>

      <TableCell className="py-3.5 pr-4">
        <ChevronRight
          className={cn(
            'size-4 text-muted-foreground/40 transition-all',
            'group-hover:translate-x-0.5 group-hover:text-foreground',
          )}
        />
      </TableCell>
    </TableRow>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 px-6 py-20 text-center">
      <SearchX className="size-8 text-muted-foreground/40" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="h-10 border-b bg-muted/40" />
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-6 border-b px-5 py-4 last:border-0"
        >
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-2 w-32" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 flex-1" />
        </div>
      ))}
    </div>
  );
}
