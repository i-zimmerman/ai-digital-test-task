import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/http';

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => apiGet<string[]>('/products'),
    staleTime: Infinity,
  });
}
