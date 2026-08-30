import { SOURCES, type Severity } from '@rs/contracts';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import {
  FILTERABLE_SEVERITIES,
  SEVERITY_FILL,
  SEVERITY_LABEL,
} from '@/shared/config/severity';
import { humanise, shortProduct } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import type { IssueFilterState } from '../model/use-issue-filters';

/** Radix Select has no empty value, so "no filter" needs a sentinel key. */
const ANY = '__any__';

interface Props {
  state: IssueFilterState;
  products: string[];
  activeCount: number;
  resultCount?: number;
  onChange: <K extends keyof IssueFilterState>(
    key: K,
    value: IssueFilterState[K],
  ) => void;
  onReset: () => void;
}

export function IssueFilters({
  state,
  products,
  activeCount,
  resultCount,
  onChange,
  onReset,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-4 rounded-xl border bg-card px-4 py-3">
      <Field label="Product">
        <Select
          value={state.product ?? ANY}
          onValueChange={(value) =>
            onChange('product', value === ANY ? undefined : value)
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All products</SelectItem>
            {products.map((product) => (
              <SelectItem key={product} value={product}>
                {shortProduct(product)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Severity">
        <Select
          value={state.severity ?? ANY}
          onValueChange={(value) =>
            onChange('severity', value === ANY ? undefined : (value as Severity))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any severity</SelectItem>
            {FILTERABLE_SEVERITIES.map((level) => (
              <SelectItem key={level} value={level}>
                <span className="flex items-center gap-2">
                  <span className={cn('size-1.5 rounded-full', SEVERITY_FILL[level])} />
                  {SEVERITY_LABEL[level]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Channel">
        <Select
          value={state.source ?? ANY}
          onValueChange={(value) =>
            onChange('source', value === ANY ? undefined : value)
          }
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All channels</SelectItem>
            {SOURCES.map((source) => (
              <SelectItem key={source} value={source}>
                {humanise(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex h-9 items-center gap-2 pl-1">
        <Switch
          id="positive"
          checked={state.includePositive}
          onCheckedChange={(checked) => onChange('includePositive', checked)}
        />
        <Label htmlFor="positive" className="cursor-pointer text-sm font-normal">
          Include praise
        </Label>
      </div>

      <div className="ml-auto flex h-9 items-center gap-3">
        {resultCount !== undefined && (
          <span className="text-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">{resultCount}</span>{' '}
            {resultCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="size-3.5" />
            Clear {activeCount === 1 ? 'filter' : `${activeCount} filters`}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
