import type { SupabaseClient } from '@supabase/supabase-js';

export type GitHubSyncStatus = 'idle' | 'success' | 'error';

export type GitHubIntegrationConfig = {
  owner: string;
  repo: string;
  branch: string;
  lastSyncedAt: string | null;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastCommitUrl: string | null;
  lastCommitAuthor: string | null;
  lastSyncStatus: GitHubSyncStatus;
  lastSyncError: string | null;
};

type GitHubIntegrationRow = {
  owner: string | null;
  repo: string | null;
  branch: string | null;
  last_synced_at: string | null;
  last_commit_sha: string | null;
  last_commit_message: string | null;
  last_commit_url: string | null;
  last_commit_author: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

const isGitHubSyncStatus = (value: unknown): value is GitHubSyncStatus =>
  value === 'idle' || value === 'success' || value === 'error';

const cleanText = (value: unknown, fallback: string, maxLength = 120) => {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw.trim().replace(/\s+/g, '-').slice(0, maxLength);
  return cleaned || fallback;
};

const cleanOptionalText = (value: unknown, maxLength = 400) => {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw.trim().slice(0, maxLength);
  return cleaned || null;
};

export const DEFAULT_GITHUB_INTEGRATION_CONFIG: GitHubIntegrationConfig = {
  owner: 'schelotto-creator',
  repo: 'td-manager',
  branch: 'main',
  lastSyncedAt: null,
  lastCommitSha: null,
  lastCommitMessage: null,
  lastCommitUrl: null,
  lastCommitAuthor: null,
  lastSyncStatus: 'idle',
  lastSyncError: null
};

export const normalizeGitHubIntegrationConfig = (
  raw?: Partial<GitHubIntegrationConfig> | Partial<GitHubIntegrationRow> | null
): GitHubIntegrationConfig => {
  const source = raw || {};

  const lastSyncStatusRaw =
    'lastSyncStatus' in source
      ? source.lastSyncStatus
      : 'last_sync_status' in source
      ? source.last_sync_status
      : null;

  return {
    owner: cleanText(
      'owner' in source ? source.owner : null,
      DEFAULT_GITHUB_INTEGRATION_CONFIG.owner,
      100
    ),
    repo: cleanText(
      'repo' in source ? source.repo : null,
      DEFAULT_GITHUB_INTEGRATION_CONFIG.repo,
      120
    ),
    branch: cleanText(
      'branch' in source ? source.branch : null,
      DEFAULT_GITHUB_INTEGRATION_CONFIG.branch,
      160
    ),
    lastSyncedAt:
      'lastSyncedAt' in source
        ? source.lastSyncedAt || null
        : 'last_synced_at' in source
        ? source.last_synced_at || null
        : null,
    lastCommitSha:
      'lastCommitSha' in source
        ? cleanOptionalText(source.lastCommitSha, 120)
        : 'last_commit_sha' in source
        ? cleanOptionalText(source.last_commit_sha, 120)
        : null,
    lastCommitMessage:
      'lastCommitMessage' in source
        ? cleanOptionalText(source.lastCommitMessage, 500)
        : 'last_commit_message' in source
        ? cleanOptionalText(source.last_commit_message, 500)
        : null,
    lastCommitUrl:
      'lastCommitUrl' in source
        ? cleanOptionalText(source.lastCommitUrl, 500)
        : 'last_commit_url' in source
        ? cleanOptionalText(source.last_commit_url, 500)
        : null,
    lastCommitAuthor:
      'lastCommitAuthor' in source
        ? cleanOptionalText(source.lastCommitAuthor, 120)
        : 'last_commit_author' in source
        ? cleanOptionalText(source.last_commit_author, 120)
        : null,
    lastSyncStatus: isGitHubSyncStatus(lastSyncStatusRaw)
      ? lastSyncStatusRaw
      : DEFAULT_GITHUB_INTEGRATION_CONFIG.lastSyncStatus,
    lastSyncError:
      'lastSyncError' in source
        ? cleanOptionalText(source.lastSyncError, 500)
        : 'last_sync_error' in source
        ? cleanOptionalText(source.last_sync_error, 500)
        : null
  };
};

export const serializeGitHubIntegrationConfig = (config: GitHubIntegrationConfig) => {
  const normalized = normalizeGitHubIntegrationConfig(config);
  return {
    owner: normalized.owner,
    repo: normalized.repo,
    branch: normalized.branch
  };
};

export const fetchGitHubIntegrationConfig = async (
  supabaseClient: SupabaseClient
): Promise<GitHubIntegrationConfig> => {
  const { data, error } = await supabaseClient
    .from('github_integration_config')
    .select(
      'owner, repo, branch, last_synced_at, last_commit_sha, last_commit_message, last_commit_url, last_commit_author, last_sync_status, last_sync_error'
    )
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.warn('No se pudo cargar la configuración de GitHub. Se usan valores por defecto.', error);
    return DEFAULT_GITHUB_INTEGRATION_CONFIG;
  }

  if (!data) return DEFAULT_GITHUB_INTEGRATION_CONFIG;
  return normalizeGitHubIntegrationConfig(data as GitHubIntegrationRow);
};
