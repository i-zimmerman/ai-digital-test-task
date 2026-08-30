import type { Severity } from '@rs/contracts';
import { cn } from '@/shared/lib/cn';
import { SEVERITY_CHIP, SEVERITY_FILL, SEVERITY_LABEL } from '@/shared/config/severity';

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        SEVERITY_CHIP[severity],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', SEVERITY_FILL[severity])} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
