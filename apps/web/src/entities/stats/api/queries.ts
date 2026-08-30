import type { Stats } from '@rs/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/http';

export interface ExcludedReview {
  id: string;
  product: string;
  source: string;
  text: string;
  status: string;
  reason: string | null;
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiGet<Stats>('/stats'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useExcludedReviews(enabled: boolean) {
  return useQuery({
    queryKey: ['excluded'],
    queryFn: () => apiGet<ExcludedReview[]>('/excluded'),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
