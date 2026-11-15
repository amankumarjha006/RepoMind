import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { realApi, type RepositoryListItemOut } from './api';

/**
 * Shared query key — identical to useRepositoryPolling so both hooks
 * read from / write to the same React Query cache entry.
 */
export const INDEXING_QUERY_KEY = ['repositories', 'indexing-status'] as const;

const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'FETCHING', 'INDEXING', 'ANALYZING']);

/**
 * Shared indexing status hook used across TopBar progress chip, RepositoriesTable, and Dashboard.
 * - One shared cache key (same as useRepositoryPolling)
 * - Polls ONLY while a job is active (4s → 15s backoff)
 * - Pauses polling when document is hidden
 * - Resets backoff when a new job is triggered
 */
export function useIndexingStatus() {
  const queryClient = useQueryClient();
  const [backoffMs, setBackoffMs] = React.useState<number>(4000);

  const query = useQuery({
    queryKey: INDEXING_QUERY_KEY,
    queryFn: async () => {
      const res = await realApi.listRepositories(1, 100);
      return res;
    },
    // Use stale data instantly; background refetch keeps it fresh
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: (queryState) => {
      // Pause if tab is hidden
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return false;
      }

      const data = queryState.state.data;
      const repos: RepositoryListItemOut[] = Array.isArray(data)
        ? data
        : (data as any)?.items ?? [];

      const hasActiveJob = repos.some(
        (r) => r.latest_job_status && ACTIVE_JOB_STATUSES.has(r.latest_job_status)
      );

      if (!hasActiveJob) {
        return false;
      }

      return backoffMs;
    },
    select: (data): RepositoryListItemOut[] => {
      if (Array.isArray(data)) return data;
      return (data as any)?.items ?? [];
    },
  });

  const repositories = query.data ?? [];
  const activeJobRepo = repositories.find(
    (r) => r.latest_job_status && ACTIVE_JOB_STATUSES.has(r.latest_job_status)
  ) || null;

  // Exponentially increase backoff if still polling
  React.useEffect(() => {
    if (!activeJobRepo) {
      setBackoffMs(4000);
      return;
    }

    const timer = setTimeout(() => {
      setBackoffMs((prev) => Math.min(prev * 1.5, 15000));
    }, backoffMs);

    return () => clearTimeout(timer);
  }, [activeJobRepo, backoffMs, query.dataUpdatedAt]);

  const resetBackoff = React.useCallback(() => {
    setBackoffMs(4000);
    queryClient.invalidateQueries({ queryKey: INDEXING_QUERY_KEY });
  }, [queryClient]);

  return {
    repositories,
    activeJobRepo,
    isIndexing: Boolean(activeJobRepo),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    resetBackoff,
  };
}
