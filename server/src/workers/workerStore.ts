/**
 * Persistence for the office's workers: who they are, what they may do, the
 * AI settings they run with, and their task history.
 *
 * One JSON file (`~/.pixel-agents/workers.json`), written atomically and with
 * mode 0600 because it holds the user's AI provider API key.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../../../core/src/constants.js';
import {
  PALETTE_COUNT,
  WORKER_DEFAULT_ANTHROPIC_MODEL,
  WORKER_FIELD_MAX_LENGTH,
  WORKER_TASK_HISTORY_LIMIT,
  WORKERS_FILE_NAME,
} from '../constants.js';

/** What a worker is allowed to do while working on a task. */
export interface WorkerPermissions {
  /** Read web pages (fetch a URL and read its text). */
  readWeb: boolean;
  /** Read and write files inside the office's shared files folder. */
  files: boolean;
  /** Hand parts of a task to the other workers. */
  delegate: boolean;
}

export interface Worker {
  id: string;
  name: string;
  /** Job title, e.g. "Araştırmacı". */
  role: string;
  /** What this worker is trying to achieve in general. */
  goal: string;
  /** Background / personality that shapes how the worker writes and decides. */
  backstory: string;
  /** Character look: one of the bundled palettes. */
  palette: number;
  /** Character look: hue shift in degrees (0 = original colors). */
  hueShift: number;
  permissions: WorkerPermissions;
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

export type AiProvider = 'anthropic' | 'openai';

export interface WorkerSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface WorkersData {
  settings: WorkerSettings;
  workers: Worker[];
  tasks: WorkerTask[];
}

export const DEFAULT_PERMISSIONS: WorkerPermissions = {
  readWeb: true,
  files: true,
  delegate: false,
};

export function defaultWorkersData(): WorkersData {
  return {
    settings: { provider: 'anthropic', model: WORKER_DEFAULT_ANTHROPIC_MODEL, apiKey: '' },
    workers: [],
    tasks: [],
  };
}

export function workersFilePath(): string {
  return path.join(os.homedir(), SERVER_JSON_DIR, WORKERS_FILE_NAME);
}

export function newWorkerId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ── Validation (everything here may come from the browser) ──

function text(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim().slice(0, WORKER_FIELD_MAX_LENGTH) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

/** Build a valid worker from untrusted input; `base` supplies values for missing fields. */
export function sanitizeWorker(input: unknown, base: Worker): Worker {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const perms = (
    raw.permissions && typeof raw.permissions === 'object' ? raw.permissions : {}
  ) as Record<string, unknown>;
  return {
    id: base.id,
    name: text(raw.name, base.name) || base.name,
    role: text(raw.role, base.role) || base.role,
    goal: text(raw.goal, base.goal),
    backstory: text(raw.backstory, base.backstory),
    palette: int(raw.palette, 0, PALETTE_COUNT - 1, base.palette),
    hueShift: int(raw.hueShift, 0, 359, base.hueShift),
    permissions: {
      readWeb: bool(perms.readWeb, base.permissions.readWeb),
      files: bool(perms.files, base.permissions.files),
      delegate: bool(perms.delegate, base.permissions.delegate),
    },
  };
}

export function sanitizeSettings(input: unknown, base: WorkerSettings): WorkerSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const provider: AiProvider =
    raw.provider === 'anthropic' || raw.provider === 'openai' ? raw.provider : base.provider;
  // An empty or missing key keeps the stored one: the UI never receives the key
  // back, so "unchanged" arrives as an empty field.
  const apiKey = text(raw.apiKey) || base.apiKey;
  const model =
    text(raw.model) ||
    (provider === base.provider
      ? base.model
      : provider === 'anthropic'
        ? WORKER_DEFAULT_ANTHROPIC_MODEL
        : '');
  return { provider, model, apiKey };
}

/** Read the workers file. A missing or unreadable file yields empty defaults. */
export function readWorkersData(filePath = workersFilePath()): WorkersData {
  const data = defaultWorkersData();
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return data;
  }
  if (!raw || typeof raw !== 'object') return data;
  const obj = raw as Record<string, unknown>;
  data.settings = sanitizeSettings(obj.settings, data.settings);
  if (Array.isArray(obj.workers)) {
    for (const w of obj.workers) {
      const id = (w as { id?: unknown })?.id;
      if (typeof id !== 'string' || !id) continue;
      data.workers.push(
        sanitizeWorker(w, {
          id,
          name: 'Worker',
          role: 'Asistan',
          goal: '',
          backstory: '',
          palette: 0,
          hueShift: 0,
          permissions: { ...DEFAULT_PERMISSIONS },
        }),
      );
    }
  }
  if (Array.isArray(obj.tasks)) {
    for (const t of obj.tasks as Array<Record<string, unknown>>) {
      if (!t || typeof t.id !== 'string' || typeof t.workerId !== 'string') continue;
      // A task "running" in the file belonged to a previous server process.
      const status: WorkerTaskStatus =
        t.status === 'done' || t.status === 'failed' || t.status === 'stopped'
          ? t.status
          : 'stopped';
      data.tasks.push({
        id: t.id,
        workerId: t.workerId,
        description: text(t.description),
        status,
        output: typeof t.output === 'string' ? t.output : undefined,
        error: typeof t.error === 'string' ? t.error : undefined,
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : 0,
        finishedAt: typeof t.finishedAt === 'number' ? t.finishedAt : undefined,
      });
    }
  }
  return data;
}

/** Write the workers file atomically (tmp + rename), owner-only. */
export function writeWorkersData(data: WorkersData, filePath = workersFilePath()): void {
  const trimmed: WorkersData = {
    ...data,
    tasks: data.tasks.slice(-WORKER_TASK_HISTORY_LIMIT),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(trimmed, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}
