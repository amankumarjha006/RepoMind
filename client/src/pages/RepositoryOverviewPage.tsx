import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcon } from '../components/ui/MaterialIcon';
import { StatusDot } from '../components/ui/StatusDot';
import { Button } from '../components/ui/button';
import { AnimatedPage } from '../components/ui/AnimatedPage';
import { RepositoryHeader } from '../components/repository/RepositoryHeader';
import { realApi, queryKeys } from '../lib/api';
import { formatNumber, formatRelativeTime, shortSha } from '../lib/utils';
import { classifyPath } from '../lib/classifyPath';
import { getRepositoryStatusCategory } from '../lib/repositoryTableUtils';
import { setLastOpenedRepoId } from '../lib/repositoryTableUtils';
import { useAuth } from '../lib/AuthContext';
import { useIndexingStatus, INDEXING_QUERY_KEY } from '../lib/useIndexingStatus';

export function RepositoryOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { repositories, refetch: refetchIndexing } = useIndexingStatus();

  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Store last-opened repo in localStorage keyed by user id
  React.useEffect(() => {
    if (id) {
      setLastOpenedRepoId(user?.id, id);
    }
  }, [id, user?.id]);

  // ── React Query: repo detail (cached across tab switches) ──
  const {
    data: repo,
    isLoading: loadingRepo,
    error: repoError,
  } = useQuery({
    queryKey: queryKeys.repoDetail(id!),
    queryFn: () => realApi.getRepositoryDetail(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  // ── React Query: file list (cached across tab switches) ──
  const { data: fileData, isLoading: loadingFiles } = useQuery({
    queryKey: queryKeys.repoFiles(id!),
    queryFn: async () => {
      const res = await realApi.getRepositoryFiles(id!, 500, 0);
      return res;
    },
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const files = React.useMemo(() => {
    if (!fileData) return [];
    if (Array.isArray(fileData)) return fileData;
    return fileData.files || [];
  }, [fileData]);

  const fileCount = React.useMemo(() => {
    if (!fileData) return 0;
    if (Array.isArray(fileData)) return fileData.length;
    return fileData.total ?? fileData.files?.length ?? 0;
  }, [fileData]);

  // ── Live status from shared indexing hook or direct detail endpoint ──
  const currentRepoStatus = React.useMemo(() => {
    return repositories.find((r) => r.id === id);
  }, [repositories, id]);

  const rawStatus =
    repo?.latest_job_status ||
    currentRepoStatus?.latest_job_status ||
    repo?.active_version?.status;
  const isCurrentlyIndexing =
    rawStatus === 'QUEUED' ||
    rawStatus === 'FETCHING' ||
    rawStatus === 'INDEXING' ||
    rawStatus === 'ANALYZING' ||
    rawStatus === 'PENDING';

  const progressInfo = React.useMemo(() => {
    switch (rawStatus) {
      case 'QUEUED':
        return {
          percent: 15,
          stage: 'Queued',
          description: 'Waiting in indexing pipeline to clone repository',
        };
      case 'FETCHING':
        return {
          percent: 35,
          stage: 'Fetching',
          description: 'Downloading repository files and verifying commit snapshot',
        };
      case 'INDEXING':
      case 'PENDING':
        return {
          percent: 70,
          stage: 'Indexing',
          description: 'Analyzing code structure, extracting symbols, and building chunks',
        };
      case 'ANALYZING':
        return {
          percent: 90,
          stage: 'Analyzing',
          description: 'Generating vector embeddings and component architecture map',
        };
      case 'READY':
      case 'SUCCESS':
        return {
          percent: 100,
          stage: 'Ready',
          description: 'Repository indexed and ready',
        };
      default:
        return {
          percent: 0,
          stage: 'Not Indexed',
          description: 'Repository connected but not yet indexed.',
        };
    }
  }, [rawStatus]);

  // Live polling while indexing is active — invalidate query to refresh
  React.useEffect(() => {
    if (!isCurrentlyIndexing || !id) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repoDetail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.repoFiles(id) });
      queryClient.invalidateQueries({ queryKey: INDEXING_QUERY_KEY });
      refetchIndexing();
    }, 4000);

    return () => clearInterval(interval);
  }, [id, isCurrentlyIndexing, queryClient, refetchIndexing]);

  const handleReindex = async () => {
    if (!id) return;
    await realApi.analyzeRepository(id);
    refetchIndexing();
    queryClient.invalidateQueries({ queryKey: queryKeys.repoDetail(id) });
  };

  // Identify entry points from files
  const entryPoints = React.useMemo(() => {
    if (!files || files.length === 0) return [];
    const candidates = [
      'main.py', 'app.py', 'server.py', 'manage.py',
      'index.ts', 'index.tsx', 'index.js', 'index.jsx',
      'app.tsx', 'app.ts', 'app.jsx', 'app.js',
      'main.ts', 'main.tsx', 'main.js', 'main.jsx',
      'server.ts', 'server.js',
      'page.tsx', 'page.jsx', 'page.js',
      'layout.tsx', 'layout.jsx', 'layout.js',
      'route.ts', 'route.js',
      'middleware.ts', 'middleware.js', 'middlware.ts',
      'main.go', 'main.rs', 'lib.rs',
    ];
    const sourceFiles = files.filter((file) => classifyPath(file.path) === 'source');
    const matched = sourceFiles.filter((file) => {
      const fileName = file.path.split('/').pop()?.toLowerCase() || '';
      return candidates.includes(fileName);
    });

    if (matched.length > 0) {
      return matched.slice(0, 5);
    }

    // Fallback: pick shallowest source files by path depth
    return [...sourceFiles]
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length)
      .slice(0, 5);
  }, [files]);

  // Compute sampled hotspots from files
  const hotspots = React.useMemo(() => {
    if (!files || files.length === 0) return [];
    return files
      .filter((file) => classifyPath(file.path) === 'source')
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 6);
  }, [files]);

  if (loadingRepo) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto text-xs text-text-tertiary">
        Loading repository overview...
      </div>
    );
  }

  const error = repoError;
  if (error || !repo) {
    return (
      <div className="p-12 max-w-md mx-auto text-center space-y-4">
        <MaterialIcon name="error" size={32} className="text-status-red mx-auto" />
        <h2 className="text-base font-semibold text-text-primary">Repository not found</h2>
        <p className="text-xs text-text-secondary">{error instanceof Error ? error.message : 'Unknown error'}</p>
        <Button variant="ghost" onClick={() => navigate('/repositories')} className="text-xs">
          Back to Repositories
        </Button>
      </div>
    );
  }

  const activeVersion = repo.active_version;
  const statusCategory = getRepositoryStatusCategory({
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    is_private: repo.is_private,
    created_at: '',
    latest_job_status: repo.latest_job_status || currentRepoStatus?.latest_job_status || activeVersion?.status || null,
    latest_job_failure_code: repo.latest_job_failure_code || currentRepoStatus?.latest_job_failure_code || null,
    active_version_short_sha: activeVersion?.commit_sha || null,
    last_indexed_at: activeVersion?.indexed_at || null,
  });

  return (
    <AnimatedPage className="space-y-6">
      {/* Sticky 5-tab Header */}
      <RepositoryHeader repository={repo} onReindex={handleReindex} />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-10 pb-16 space-y-8">
        {/* Unindexed Repository Action Banner */}
        {!activeVersion && !isCurrentlyIndexing && (
          <div className="p-5 rounded-2xl border border-white/10 bg-surface-raised space-y-3.5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#6F757C]" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-text-primary">Repository Connected — Ready to Index</h2>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
                  Analyze code structure, extract AST symbols, generate Cloudflare Workers AI embeddings, and build the architecture map for code search and AI chat.
                </p>
              </div>
              <Button
                onClick={handleReindex}
                className="shrink-0 gap-2 bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-text)] hover:bg-[var(--color-btn-primary-hover)] font-medium text-xs px-4 py-2 rounded-lg cursor-pointer"
              >
                <MaterialIcon name="play_arrow" size={16} />
                <span>Start Indexing</span>
              </Button>
            </div>
          </div>
        )}

        {/* Active Indexing / Re-indexing Progress Banner */}
        {isCurrentlyIndexing && (
          <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 backdrop-blur-xs space-y-3 animate-fade-in shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <MaterialIcon name="sync" size={18} spin className="text-accent shrink-0" />
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    Indexing repository in progress…
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/15 text-accent font-medium">
                    {progressInfo.stage}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-medium text-accent tabular-nums">
                {progressInfo.percent}%
              </span>
            </div>

            {/* Linear Progress Bar */}
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressInfo.percent}%` }}
              />
            </div>

            <p className="text-[11px] text-text-secondary leading-normal">
              {progressInfo.description}
            </p>
          </div>
        )}

        {/* 1. Compact Stat Strip (4 items) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
          <div className="p-4 rounded-xl border border-white/10 bg-surface-raised space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Primary Language
            </span>
            <div className="text-sm font-semibold text-text-primary">
              {repo.primary_language || 'Python'}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-surface-raised space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Indexed Files
            </span>
            <div className="text-sm font-semibold text-text-primary font-mono tabular-nums">
              {fileCount > 0 ? formatNumber(fileCount) : loadingFiles ? '…' : '—'}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-surface-raised space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Lines of Code
            </span>
            <div className="text-sm font-semibold text-text-primary font-mono tabular-nums">
              {repo.lines_of_code ? formatNumber(repo.lines_of_code) : '—'}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-surface-raised space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Last Indexed
            </span>
            <div className="text-sm font-semibold text-text-primary tabular-nums">
              {activeVersion?.indexed_at
                ? formatRelativeTime(activeVersion.indexed_at)
                : 'Never'}
            </div>
          </div>
        </div>

        {/* 2. Start Here & Index Health 2-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* Start Here Card */}
          <div className="p-5 rounded-2xl border border-white/10 bg-surface-raised space-y-3.5">
            <div className="flex items-center gap-2">
              <MaterialIcon name="near_me" size={16} className="text-accent" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Start Here
              </h2>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Key entry points and primary modules identified in this repository:
            </p>

            <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-surface-base/50">
              {entryPoints.length > 0 ? (
                entryPoints.map((ep) => (
                  <Link
                    key={ep.path}
                    to={`/repositories/${repo.id}/files?path=${encodeURIComponent(ep.path)}`}
                    className="p-3 flex items-center justify-between text-xs hover:bg-surface-overlay/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MaterialIcon
                        name="description"
                        size={14}
                        className="text-text-tertiary group-hover:text-accent"
                      />
                      <span className="font-mono text-text-primary group-hover:text-accent truncate">
                        {ep.path}
                      </span>
                    </div>
                    <MaterialIcon name="chevron_right" size={14} className="text-text-tertiary" />
                  </Link>
                ))
              ) : (
                <div className="p-4 text-xs text-text-tertiary text-center">
                  No explicit entry point files detected.
                </div>
              )}
            </div>
          </div>

          {/* Index Health Card */}
          <div className="p-5 rounded-2xl border border-white/10 bg-surface-raised space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MaterialIcon name="health_and_safety" size={16} className="text-accent" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Index Health
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <StatusDot
                  status={
                    statusCategory === 'INDEXING'
                      ? 'indexing'
                      : statusCategory === 'FAILED'
                      ? 'failed'
                      : statusCategory === 'NOT_INDEXED' || statusCategory === 'OTHER'
                      ? 'not_indexed'
                      : 'ready'
                  }
                  showText={false}
                />
                <span className="capitalize">
                  {statusCategory === 'NOT_INDEXED' || statusCategory === 'OTHER'
                    ? 'Not indexed'
                    : statusCategory === 'INDEXING'
                    ? 'Indexing'
                    : statusCategory === 'FAILED'
                    ? 'Failed'
                    : 'Ready'}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-text-secondary">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-text-tertiary">Active Branch</span>
                <span className="font-mono text-text-primary">{activeVersion?.branch || 'main'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-text-tertiary">Commit SHA</span>
                <span className="font-mono text-text-primary">
                  {activeVersion?.commit_sha ? shortSha(activeVersion.commit_sha) : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-tertiary">AST Nodes Analyzed</span>
                <span className="font-mono text-text-primary tabular-nums">
                  {repo.ast_nodes ? formatNumber(repo.ast_nodes) : '—'}
                </span>
              </div>
            </div>

            {statusCategory === 'NOT_INDEXED' && (
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={handleReindex}
                  className="w-full text-xs gap-1.5 bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-text)] hover:bg-[var(--color-btn-primary-hover)] rounded-lg font-medium cursor-pointer"
                >
                  <MaterialIcon name="play_arrow" size={15} />
                  <span>Start Indexing</span>
                </Button>
              </div>
            )}

            {statusCategory === 'FAILED' && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReindex}
                  className="w-full text-xs text-status-red border border-status-red/20 hover:bg-status-red/10 rounded-lg"
                >
                  Retry indexing
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 3. Hotspots Table */}
        <div className="p-5 rounded-2xl border border-white/10 bg-surface-raised space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <MaterialIcon name="local_fire_department" size={16} className="text-accent" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Top Code Hotspots
              </h2>
            </div>
            <span className="text-[11px] text-text-tertiary italic">
              Approximate (based on sampled edge evidence)
            </span>
          </div>

          <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-surface-base/50">
            {hotspots.length > 0 ? (
              hotspots.map((hs, index) => (
                <Link
                  key={hs.path}
                  to={`/repositories/${repo.id}/files?path=${encodeURIComponent(hs.path)}`}
                  className="p-3 flex items-center justify-between text-xs hover:bg-surface-overlay/60 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-text-tertiary font-mono text-[11px] w-4">
                      {index + 1}
                    </span>
                    <span className="font-mono text-text-primary group-hover:text-accent truncate">
                      {hs.path}
                    </span>
                  </div>
                  <span className="text-[11px] text-text-tertiary font-mono tabular-nums shrink-0">
                    {hs.size ? `${Math.round(hs.size / 1024)} KB` : 'source'}
                  </span>
                </Link>
              ))
            ) : (
              <div className="p-4 text-xs text-text-tertiary text-center">
                No hotspots calculated yet.
              </div>
            )}
          </div>
        </div>

        {/* 4. Conditional Index History (collapsible) */}
        {activeVersion && (
          <div className="rounded-2xl border border-white/10 bg-surface-raised overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-overlay/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              aria-expanded={historyOpen}
            >
              <div className="flex items-center gap-2">
                <MaterialIcon
                  name={historyOpen ? 'expand_more' : 'chevron_right'}
                  size={18}
                  className="text-text-tertiary"
                />
                <span className="text-xs font-semibold text-text-primary">
                  Indexing history
                </span>
              </div>
              <span className="text-[11px] text-text-tertiary">
                {historyOpen ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {historyOpen && (
              <div className="p-4 border-t border-white/5 text-xs text-text-secondary space-y-2 bg-surface-base/30">
                <div className="flex items-center justify-between py-1">
                  <span className="font-mono">{shortSha(activeVersion.commit_sha)}</span>
                  <span className="text-text-tertiary">
                    {activeVersion.indexed_at
                      ? formatRelativeTime(activeVersion.indexed_at)
                      : 'Initial commit'}
                  </span>
                  <span className="capitalize text-status-green">Completed</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
export default RepositoryOverviewPage;
