import type { Severity } from '@rs/contracts';
import { useCallback, useMemo, useState } from 'react';
import type { IssueQueryParams } from '@/entities/issue/api/queries';

export interface IssueFilterState {
  product?: string;
  severity?: Severity;
  source?: string;
  includePositive: boolean;
}

const EMPTY: IssueFilterState = { includePositive: false };

export function useIssueFilters() {
  const [state, setState] = useState<IssueFilterState>(EMPTY);

  const set = useCallback(
    <K extends keyof IssueFilterState>(key: K, value: IssueFilterState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => setState(EMPTY), []);

  const activeCount =
    (state.product ? 1 : 0) + (state.severity ? 1 : 0) + (state.source ? 1 : 0);

  const params = useMemo<IssueQueryParams>(
    () => ({
      product: state.product,
      severity: state.severity,
      source: state.source,
      includePositive: state.includePositive || undefined,
    }),
    [state.product, state.severity, state.source, state.includePositive],
  );

  return { state, set, reset, params, activeCount };
}
