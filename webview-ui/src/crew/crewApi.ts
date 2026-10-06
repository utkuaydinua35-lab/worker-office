/**
 * Client for the standalone server's /api/workers routes (the office crew).
 *
 * Authenticated with the server token the CLI printed in the office URL —
 * the same secret that makes the WebSocket session privileged.
 */

export interface WorkerPermissions {
  readWeb: boolean;
  files: boolean;
  delegate: boolean;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  palette: number;
  hueShift: number;
  permissions: WorkerPermissions;
  busy?: boolean;
}

export type WorkerTaskStatus = 'running' | 'done' | 'failed' | 'stopped';

export interface WorkerTask {
  id: string;
  workerId: string;
  description: string;
  status: WorkerTaskStatus;
  output?: string;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface CrewView {
  ready: boolean;
  notReadyReason?: string;
  settings: { provider: 'anthropic' | 'openai'; model: string; hasApiKey: boolean };
  filesDir: string;
  workers: Worker[];
  tasks: WorkerTask[];
}

const PREFIX = '/api/workers';

function token(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

/** True when this page was opened from the tokened office URL. */
export function crewApiAvailable(): boolean {
  return token() !== null;
}

async function call(method: string, path: string, body?: unknown): Promise<CrewView> {
  const res = await fetch(`${PREFIX}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token() ?? ''}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new Error(
      typeof message === 'string'
        ? message
        : res.status === 401
          ? 'Yetkisiz: ofisi kurulumun açtığı bağlantıdan açın.'
          : `Sunucu hatası (${res.status}).`,
    );
  }
  return data as CrewView;
}

export const crewApi = {
  load: () => call('GET', ''),
  saveSettings: (s: { provider: string; model: string; apiKey?: string }) =>
    call('PUT', '/settings', s),
  createWorker: (w: Partial<Worker>) => call('POST', '', w),
  updateWorker: (id: string, w: Partial<Worker>) => call('PUT', `/${encodeURIComponent(id)}`, w),
  deleteWorker: (id: string) => call('DELETE', `/${encodeURIComponent(id)}`),
  assignTask: (id: string, description: string) =>
    call('POST', `/${encodeURIComponent(id)}/tasks`, { description }),
  stopTask: (taskId: string) => call('POST', `/tasks/${encodeURIComponent(taskId)}/stop`, {}),
};
