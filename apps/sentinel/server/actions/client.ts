import { FORGEJO_BASE_URL, FORGEJO_TOKEN } from '../config.ts';
import type { ForgejoRunPayload } from './map.ts';

export type ForgejoRepoRef = {
  owner: string;
  name: string;
  archived: boolean;
  hasActions: boolean;
};

type ForgejoRepoPayload = {
  name?: string;
  archived?: boolean;
  has_actions?: boolean;
  owner?: { login?: string };
};

type ListRunsResponse = {
  workflow_runs?: ForgejoRunPayload[];
  total_count?: number;
};

export class ForgejoApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ForgejoApiError';
    this.status = status;
  }
}

export function isForgejoConfigured(): boolean {
  return Boolean(FORGEJO_TOKEN);
}

async function forgejoFetch(path: string): Promise<Response> {
  const url = `${FORGEJO_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `token ${FORGEJO_TOKEN}`,
    },
  });
  return res;
}

async function listOwnerRepos(owner: string, kind: 'orgs' | 'users'): Promise<ForgejoRepoRef[]> {
  const repos: ForgejoRepoRef[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await forgejoFetch(
      `/api/v1/${kind}/${encodeURIComponent(owner)}/repos?limit=50&page=${page}`,
    );
    if (res.status === 404) return [];
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ForgejoApiError(res.status, body || `list repos failed (${res.status})`);
    }
    const batch = (await res.json()) as ForgejoRepoPayload[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const repo of batch) {
      const name = repo.name?.trim();
      if (!name) continue;
      repos.push({
        owner: repo.owner?.login?.trim() || owner,
        name,
        archived: Boolean(repo.archived),
        hasActions: repo.has_actions !== false,
      });
    }
    if (batch.length < 50) break;
  }
  return repos;
}

export async function listReposForOwner(owner: string): Promise<ForgejoRepoRef[]> {
  const asOrg = await listOwnerRepos(owner, 'orgs');
  if (asOrg.length > 0) return asOrg;
  return listOwnerRepos(owner, 'users');
}

export async function listActionRuns(
  owner: string,
  repo: string,
  options: { page: number; limit: number },
): Promise<{ runs: ForgejoRunPayload[]; totalCount: number }> {
  const qs = new URLSearchParams({
    page: String(options.page),
    limit: String(options.limit),
  });
  const res = await forgejoFetch(
    `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${qs}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ForgejoApiError(res.status, body || `list runs failed (${res.status})`);
  }
  const payload = (await res.json()) as ListRunsResponse;
  return {
    runs: Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [],
    totalCount: typeof payload.total_count === 'number' ? payload.total_count : 0,
  };
}

export async function getActionRun(
  owner: string,
  repo: string,
  runId: number,
): Promise<ForgejoRunPayload> {
  const res = await forgejoFetch(
    `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ForgejoApiError(res.status, body || `get run failed (${res.status})`);
  }
  return (await res.json()) as ForgejoRunPayload;
}
