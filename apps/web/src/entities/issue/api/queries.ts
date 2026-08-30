import type { IssueFilters, TopIssue } from '@rs/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/http';

export type IssueQueryParams = Pick<IssueFilters, 'product' | 'severity' | 'source'> & {
  includePositive?: boolean;
};

export const issueKeys = {
  all: ['issues'] as const,
  list: (params: IssueQueryParams) => ['issues', 'list', params] as const,
};

export function useTopIssues(params: IssueQueryParams) {
  return useQuery({
    queryKey: issueKeys.list(params),
    queryFn: () => apiGet<TopIssue[]>('/issues', { ...params }),
    // The dataset only changes when the pipeline is re-run, so nothing gained
    // by refetching on every focus.
    staleTime: 5 * 60 * 1000,
  });
}
