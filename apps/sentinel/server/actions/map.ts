export type ForgejoRunPayload = {
  id: number;
  title?: string;
  workflow_id?: string;
  index_in_repo?: number;
  prettyref?: string;
  commit_sha?: string;
  event?: string;
  status?: string;
  started?: string;
  stopped?: string;
  created?: string;
  updated?: string;
  duration?: number;
  html_url?: string;
  repository?: {
    name?: string;
    full_name?: string;
    owner?: { login?: string };
  };
};

export type ActionRunRow = {
  owner: string;
  repo: string;
  runId: number;
  workflowId: string;
  title: string;
  status: string;
  event: string;
  ref: string | null;
  commitSha: string | null;
  runNumber: number;
  htmlUrl: string;
  startedAt: number | null;
  stoppedAt: number | null;
  durationMs: number | null;
  createdAt: number;
  updatedAt: number;
};

function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Forgejo ActionRun.duration is a Go time.Duration in nanoseconds. */
export function durationNsToMs(durationNs: number | undefined): number | null {
  if (durationNs == null || !Number.isFinite(durationNs) || durationNs < 0) return null;
  return Math.round(durationNs / 1_000_000);
}

export function mapForgejoRun(
  payload: ForgejoRunPayload,
  ownerFallback: string,
  repoFallback: string,
): ActionRunRow {
  const owner = payload.repository?.owner?.login?.trim() || ownerFallback;
  const repo = payload.repository?.name?.trim() || repoFallback;
  const startedAt = parseIsoMs(payload.started);
  const stoppedAt = parseIsoMs(payload.stopped);
  const fromNs = durationNsToMs(payload.duration);
  const fromWindow =
    startedAt != null && stoppedAt != null && stoppedAt >= startedAt ? stoppedAt - startedAt : null;
  const createdAt = parseIsoMs(payload.created) ?? startedAt ?? Date.now();
  const updatedAt = parseIsoMs(payload.updated) ?? stoppedAt ?? createdAt;
  const runNumber = payload.index_in_repo ?? payload.id;
  const htmlUrl =
    payload.html_url?.trim() ||
    `https://git.darkavianlabs.com/${owner}/${repo}/actions/runs/${runNumber}`;

  return {
    owner,
    repo,
    runId: payload.id,
    workflowId: payload.workflow_id?.trim() || 'unknown',
    title: payload.title?.trim() || payload.workflow_id?.trim() || `run ${payload.id}`,
    status: payload.status?.trim() || 'unknown',
    event: payload.event?.trim() || '',
    ref: payload.prettyref?.trim() || null,
    commitSha: payload.commit_sha?.trim() || null,
    runNumber,
    htmlUrl,
    startedAt,
    stoppedAt,
    durationMs: fromNs ?? fromWindow,
    createdAt,
    updatedAt,
  };
}
