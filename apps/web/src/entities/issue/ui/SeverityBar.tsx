import type { Severity } from '@rs/contracts';
import { cn } from '@/shared/lib/cn';
import { SEVERITY_FILL, SEVERITY_LABEL, SEVERITY_ORDER } from '@/shared/config/severity';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

/**
 * How one issue's reports split across severity levels.
 *
 * Two categories with the same count read very differently when one is mostly
 * critical and the other mostly low, and the count alone hides that.
 */
export function SeverityBar({
  mix,
  className,
}: {
  mix: Partial<Record<Severity, number>>;
  className?: string;
}) {
  const total = Object.values(mix).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  if (total === 0) return null;

  const segments = SEVERITY_ORDER.filter((level) => (mix[level] ?? 0) > 0);
  const summary = segments
    .map((level) => `${mix[level]} ${SEVERITY_LABEL[level].toLowerCase()}`)
    .join(', ');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn('flex w-full max-w-36 gap-px', className)}
          role="img"
          aria-label={summary}
        >
          {segments.map((level, index) => (
            <div
              key={level}
              className={cn(
                'h-2 transition-opacity',
                SEVERITY_FILL[level],
                index === 0 && 'rounded-l-full',
                index === segments.length - 1 && 'rounded-r-full',
              )}
              style={{ width: `${((mix[level] ?? 0) / total) * 100}%` }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex flex-col gap-1">
        {segments.map((level) => (
          <span key={level} className="flex items-center gap-2 text-xs">
            <span className={cn('size-1.5 rounded-full', SEVERITY_FILL[level])} />
            <span className="tabular w-6 text-right font-medium">{mix[level]}</span>
            <span className="opacity-80">{SEVERITY_LABEL[level]}</span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
