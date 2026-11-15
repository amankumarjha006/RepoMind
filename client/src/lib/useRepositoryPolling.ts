import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { realApi, ApiError, RepositoryListItemOut, RepositoryListOut } from './api';
import { hasActiveJob, computeNextPollDelay } from './polling';

/** Shared query key — same as useIndexingStatus so the cache is unified. */
export const REPO_LIST_QUERY_KEY = ['repositories', 'indexing-status'] as const;

export interface UseRepositoryPollingOptions {
  page?: number;
  limit?: number;
  search?: string;
  onSessionExpired?: () => void;
}

export interface UseRepositoryPollingResult {
  repositories: RepositoryListItemOut[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  loading: boolean;
  isPolling: boolean;
  error: ApiError | Error | null;
  refetch: () => Promise<void>;
  triggerIndex: (repositoryId: string, branch?: string) => Promise<void>;
  deleteRepository: (repositoryId: string) => Promise<void>;
}

export function useRepositoryPolling({
  page = 1,
  limit = 50,
  search = '',
  onSessionExpired,
}: UseRepositoryPollingOptions = {}): UseRepositoryPollingResult {
  const queryClient = useQueryClient();
  const onSessionExpiredRef = React.useRef(onSessionExpired);
  onSessionExpiredRef.current = onSessionExpired;

  // Compute dynamic refetch interval based on whether any job is active
  const [pollMs, setPollMs] = React.useState<number | false>(false);
  const activeSinceRef = React.useRef<number | null>(null);

  const query = useQuery({
    queryKey: REPO_LIST_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await realApi.listRepositories(page, Math.max(limit, 100), search);
        return res;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpiredRef.current?.();
        }
        throw err;
      }
    },
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: pollMs,
  });

  const repositories: RepositoryListItemOut[] = React.useMemo(() => {
    if (!query.data) return [];
    if (Array.isArray(query.data)) return query.data;
    return query.data.items ?? [];
  }, [query.data]);

  const total: number = React.useMemo(() => {
    if (!query.data) return 0;
    if (Array.isArray(query.data)) return query.data.length;
    return query.data.total ?? query.data.items?.length ?? 0;
  }, [query.data]);

  const hasMore: boolean = React.useMemo(() => {
    if (!query.data) return false;
    if (Array.isArray(query.data)) return false;
    return Boolean(query.data.has_more);
  }, [query.data]);

  // Update polling interval when data changes
  React.useEffect(() => {
    const active = hasActiveJob(repositories);
    if (active) {
      if (activeSinceRef.current === null) {
        activeSinceRef.current = Date.now();
      }
      const elapsed = Date.now() - activeSinceRef.current;
      const nextDelay = computeNextPollDelay(active, elapsed);
      setPollMs(nextDelay ?? 10_000);
    } else {
      activeSinceRef.current = null;
      setPollMs(false);
    }
  }, [repositories]);

  // Pause polling when tab is hidden
  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: REPO_LIST_QUERY_KEY });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [queryClient]);

  const refetch = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: REPO_LIST_QUERY_KEY });
  }, [queryClient]);

  const triggerIndex = React.useCallback(
    async (repositoryId: string, branch?: string) => {
      await realApi.analyzeRepository(repositoryId, branch || null);
      activeSinceRef.current = Date.now();
      setPollMs(4000);
      await queryClient.invalidateQueries({ queryKey: REPO_LIST_QUERY_KEY });
    },
    [queryClient]
  );

  const deleteRepository = React.useCallback(
    async (repositoryId: string) => {
      await realApi.deleteRepository(repositoryId);
      // Optimistic update: remove from cache immediately
      queryClient.setQueryData(REPO_LIST_QUERY_KEY, (old: unknown) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.filter((r: RepositoryListItemOut) => r.id !== repositoryId);
        }
        const obj = old as RepositoryListOut;
        return {
          ...obj,
          items: (obj.items || []).filter((r: RepositoryListItemOut) => r.id !== repositoryId),
          total: Math.max(0, (obj.total ?? 1) - 1),
        };
      });
    },
    [queryClient]
  );

  return {
    repositories,
    total,
    page,
    limit,
    hasMore,
    loading: query.isLoading,
    isPolling: pollMs !== false,
    error: query.error instanceof ApiError || query.error instanceof Error ? query.error : null,
    refetch,
    triggerIndex,
    deleteRepository,
  };
}
