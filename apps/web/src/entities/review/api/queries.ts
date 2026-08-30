import type { IssueCategory, ReviewDetail } from '@rs/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/http';
import type { IssueQueryParams } from '@/entities/issue/api/queries';

export const reviewKeys = {
  byIssue: (category: IssueCategory | null, params: IssueQueryParams) =>
    ['reviews', 'by-issue', category, params] as const,
};

export function useIssueReviews(
  category: IssueCategory | null,
  params: IssueQueryParams,
) {
  return useQuery({
    queryKey: reviewKeys.byIssue(category, params),
    queryFn: () =>
      apiGet<ReviewDetail[]>(`/issues/${category}/reviews`, { ...params }),
    enabled: category !== null,
    staleTime: 5 * 60 * 1000,
  });
}
