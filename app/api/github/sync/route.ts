import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  normalizeGitHubIntegrationConfig,
  type GitHubIntegrationConfig,
  type GitHubSyncStatus
} from '@/lib/github-integration-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GitHubCommitPayload = {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
    };
  };
  author?: {
    login?: string;
  };
  message?: string;
};

const toErrorText = (error: unknown) => {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; details?: string; hint?: string };
    return e.message || e.details || e.hint || JSON.stringify(error);
  }
  return String(error);
};

const getBearerToken = (request: NextRequest) => {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const shortText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const toCommitResponse = (payload: GitHubCommitPayload) => {
  const sha = shortText(payload.sha, 120);
  const url = shortText(payload.html_url, 500);
  const fullMessage = shortText(payload.commit?.message || '', 500);
  const message = fullMessage ? fullMessage.split('\n')[0].slice(0, 240) : null;
  const author = shortText(payload.author?.login || payload.commit?.author?.name || '', 120);

  return {
    sha,
    url,
    message,
    author
  };
};

const persistSyncResult = async (
  config: GitHubIntegrationConfig,
  params: {
    status: GitHubSyncStatus;
    syncedAt: string;
    errorText?: string | null;
    commit?: {
      sha: string | null;
      message: string | null;
      url: string | null;
      author: string | null;
    } | null;
  }
) => {
  const supabaseAdmin = getSupabaseAdmin();

  const payload = {
    id: 1,
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    last_synced_at: params.syncedAt,
    last_sync_status: params.status,
    last_sync_error: shortText(params.errorText || '', 500),
    last_commit_sha: params.commit?.sha || null,
    last_commit_message: params.commit?.message || null,
    last_commit_url: params.commit?.url || null,
    last_commit_author: params.commit?.author || null
  };

  const { error } = await supabaseAdmin
    .from('github_integration_config')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    throw new Error(`No se pudo guardar resultado de sync GitHub: ${toErrorText(error)}`);
  }
};

export async function POST(request: NextRequest) {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ ok: false, error: 'Falta token de sesión para autorizar sync.' }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Falta GITHUB_TOKEN en variables de entorno. Añádelo en local y en Vercel.'
      },
      { status: 500 }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'Sesión inválida.' }, { status: 401 });
    }

    const { data: manager, error: managerError } = await supabaseAdmin
      .from('managers')
      .select('is_admin')
      .eq('owner_id', authData.user.id)
      .maybeSingle();

    if (managerError) {
      throw new Error(`No se pudo validar permisos admin: ${toErrorText(managerError)}`);
    }

    if (!manager?.is_admin) {
      return NextResponse.json({ ok: false, error: 'Solo administradores pueden sincronizar GitHub.' }, { status: 403 });
    }

    const { data: rawConfig, error: configError } = await supabaseAdmin
      .from('github_integration_config')
      .select('owner, repo, branch, last_synced_at, last_commit_sha, last_commit_message, last_commit_url, last_commit_author, last_sync_status, last_sync_error')
      .eq('id', 1)
      .maybeSingle();

    if (configError) {
      throw new Error(
        `No se pudo cargar github_integration_config. Aplica la migración 20260304_add_github_integration_config.sql. Detalle: ${toErrorText(configError)}`
      );
    }

    const config = normalizeGitHubIntegrationConfig(rawConfig);

    const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
    const branchRef = encodeURIComponent(config.branch);
    const githubResponse = await fetch(`https://api.github.com/repos/${repoPath}/commits/${branchRef}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'td-manager-admin',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store'
    });

    const githubPayload = (await githubResponse.json().catch(() => null)) as GitHubCommitPayload | null;
    const syncedAt = new Date().toISOString();

    if (!githubResponse.ok) {
      const apiError = shortText(githubPayload?.message || githubResponse.statusText || 'Sync fallida', 500);

      await persistSyncResult(config, {
        status: 'error',
        syncedAt,
        errorText: apiError,
        commit: null
      });

      return NextResponse.json(
        {
          ok: false,
          error: `GitHub API devolvió ${githubResponse.status}. ${apiError || 'Error desconocido.'}`
        },
        { status: 502 }
      );
    }

    const commit = toCommitResponse(githubPayload || {});

    await persistSyncResult(config, {
      status: 'success',
      syncedAt,
      errorText: null,
      commit
    });

    return NextResponse.json({
      ok: true,
      config: {
        ...config,
        lastSyncedAt: syncedAt,
        lastSyncStatus: 'success',
        lastSyncError: null,
        lastCommitSha: commit.sha,
        lastCommitMessage: commit.message,
        lastCommitUrl: commit.url,
        lastCommitAuthor: commit.author
      },
      commit
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: toErrorText(error)
      },
      { status: 500 }
    );
  }
}
