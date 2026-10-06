/**
 * The office crew: workers the user creates in the UI, shown as characters
 * that sit in the office, and tasks the user gives them, run by the CrewAI
 * runner (`server/workers/runner.py`) in a child Python process.
 *
 * Each worker is one office character with the session id
 * `worker-<workerId>`. The runner maps its CrewAI agent onto that session
 * (PixelAgentsListener's session_ids), so the character types while the
 * worker works, shows the tool it uses, and goes idle when it is done —
 * through the ordinary `/api/hooks/crewai` path, no special casing.
 */

import { type ChildProcess, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';

import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  WORKER_FIELD_MAX_LENGTH,
  WORKER_MAX_COUNT,
  WORKER_RESULT_MARKER,
  WORKER_SESSION_PREFIX,
  WORKER_TASK_TEXT_MAX_LENGTH,
  WORKER_TASK_TIMEOUT_MS,
} from '../constants.js';
import { CREWAI_PROVIDER_ID } from '../providers/hook/crewai/constants.js';
import type { AgentState } from '../types.js';
import {
  DEFAULT_PERMISSIONS,
  newWorkerId,
  readWorkersData,
  sanitizeSettings,
  sanitizeWorker,
  type Worker,
  type WorkersData,
  workersFilePath,
  type WorkerTask,
  writeWorkersData,
} from './workerStore.js';

/** Thrown for a request the user can fix; the message is shown in the UI. */
export class WorkerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** What the UI sees. Never contains the API key. */
export interface WorkersView {
  ready: boolean;
  /** Why tasks cannot run (no Python runtime), shown in the UI. */
  notReadyReason?: string;
  settings: { provider: string; model: string; hasApiKey: boolean };
  filesDir: string;
  workers: Array<Worker & { busy: boolean }>;
  tasks: WorkerTask[];
}

export interface WorkerServiceOptions {
  /** Python interpreter with crewAI installed. Undefined = tasks cannot run. */
  pythonPath?: string;
  /** Path to server/workers/runner.py. */
  runnerPath: string;
  /** Folder the workers may read and write files in (the "files" permission). */
  filesDir: string;
  /** Override for tests. */
  dataPath?: string;
}

export function workerSessionId(workerId: string): string {
  return `${WORKER_SESSION_PREFIX}${workerId}`;
}

export class WorkerService {
  private data: WorkersData;
  private readonly dataPath: string;
  /** workerId -> office agent id */
  private readonly characters = new Map<string, number>();
  /** taskId -> runner process */
  private readonly running = new Map<string, ChildProcess>();

  constructor(
    private readonly store: AgentStateStore,
    private readonly runtime: AgentRuntime,
    private readonly opts: WorkerServiceOptions,
  ) {
    this.dataPath = opts.dataPath ?? workersFilePath();
    this.data = readWorkersData(this.dataPath);
  }

  /** Put every worker's character in the office. */
  start(): void {
    try {
      fs.mkdirSync(this.opts.filesDir, { recursive: true });
    } catch (err) {
      console.warn(`[Pixel Agents] Workers: cannot create ${this.opts.filesDir}: ${String(err)}`);
    }
    // Persisted agents are restored later (on the first webviewReady) under
    // their old ids; keep worker ids clear of them.
    for (const p of this.store.loadPersistedAgents()) {
      if (p.id >= this.store.nextAgentId.current) this.store.nextAgentId.current = p.id + 1;
    }
    for (const worker of this.data.workers) this.syncCharacter(worker);
    console.log(`[Pixel Agents] Workers: ${this.data.workers.length} in the office`);
  }

  dispose(): void {
    for (const child of this.running.values()) child.kill();
    this.running.clear();
  }

  // ── Queries ──

  private notReadyReason(): string | undefined {
    const py = this.opts.pythonPath;
    if (!py || !fs.existsSync(py)) {
      return 'Görev çalıştırma bileşeni (Python + CrewAI) kurulu değil. Kurulum komutunu yeniden çalıştırın.';
    }
    if (!fs.existsSync(this.opts.runnerPath)) {
      return `Görev çalıştırıcısı bulunamadı: ${this.opts.runnerPath}`;
    }
    return undefined;
  }

  private busyWorkers(): Set<string> {
    const busy = new Set<string>();
    for (const t of this.data.tasks) if (t.status === 'running') busy.add(t.workerId);
    return busy;
  }

  view(): WorkersView {
    const reason = this.notReadyReason();
    const busy = this.busyWorkers();
    return {
      ready: reason === undefined,
      notReadyReason: reason,
      settings: {
        provider: this.data.settings.provider,
        model: this.data.settings.model,
        hasApiKey: this.data.settings.apiKey.length > 0,
      },
      filesDir: this.opts.filesDir,
      workers: this.data.workers.map((w) => ({ ...w, busy: busy.has(w.id) })),
      tasks: [...this.data.tasks].reverse(),
    };
  }

  // ── Mutations ──

  updateSettings(input: unknown): void {
    this.data.settings = sanitizeSettings(input, this.data.settings);
    this.save();
  }

  createWorker(input: unknown): Worker {
    if (this.data.workers.length >= WORKER_MAX_COUNT) {
      throw new WorkerError(`En fazla ${WORKER_MAX_COUNT} worker olabilir.`);
    }
    const used = new Set(this.data.workers.map((w) => w.palette));
    const palette = [0, 1, 2, 3, 4, 5].find((p) => !used.has(p)) ?? 0;
    const worker = sanitizeWorker(input, {
      id: newWorkerId(),
      name: `Worker ${this.data.workers.length + 1}`,
      role: 'Asistan',
      goal: '',
      backstory: '',
      palette,
      hueShift: 0,
      permissions: { ...DEFAULT_PERMISSIONS },
    });
    this.data.workers.push(worker);
    this.save();
    this.syncCharacter(worker);
    return worker;
  }

  updateWorker(id: string, input: unknown): Worker {
    const index = this.data.workers.findIndex((w) => w.id === id);
    if (index < 0) throw new WorkerError('Worker bulunamadı.', 404);
    const worker = sanitizeWorker(input, this.data.workers[index]);
    this.data.workers[index] = worker;
    this.save();
    this.syncCharacter(worker);
    return worker;
  }

  deleteWorker(id: string): void {
    const index = this.data.workers.findIndex((w) => w.id === id);
    if (index < 0) throw new WorkerError('Worker bulunamadı.', 404);
    for (const t of this.data.tasks) {
      if (t.workerId === id && t.status === 'running') this.stopTask(t.id);
    }
    this.data.workers.splice(index, 1);
    this.save();
    this.removeCharacter(id);
  }

  assignTask(workerId: string, description: unknown): WorkerTask {
    const worker = this.data.workers.find((w) => w.id === workerId);
    if (!worker) throw new WorkerError('Worker bulunamadı.', 404);
    const text =
      typeof description === 'string' ? description.trim().slice(0, WORKER_FIELD_MAX_LENGTH) : '';
    if (!text) throw new WorkerError('Görev metni boş olamaz.');
    const reason = this.notReadyReason();
    if (reason) throw new WorkerError(reason, 503);
    if (!this.data.settings.apiKey) {
      throw new WorkerError('Önce Ayarlar bölümüne yapay zekâ API anahtarınızı girin.');
    }
    if (this.busyWorkers().has(workerId)) {
      throw new WorkerError(`${worker.name} şu an başka bir görevde. Bitmesini bekleyin.`, 409);
    }

    const task: WorkerTask = {
      id: crypto.randomUUID().slice(0, 8),
      workerId,
      description: text,
      status: 'running',
      createdAt: Date.now(),
    };
    this.data.tasks.push(task);
    this.save();
    this.runTask(task, worker);
    return task;
  }

  stopTask(taskId: string): void {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) throw new WorkerError('Görev bulunamadı.', 404);
    if (task.status !== 'running') return;
    this.finishTask(task, 'stopped', undefined, 'Görev durduruldu.');
    this.running.get(taskId)?.kill();
    this.running.delete(taskId);
  }

  // ── Running ──

  private runTask(task: WorkerTask, worker: Worker): void {
    const teammates = worker.permissions.delegate
      ? this.data.workers.filter((w) => w.id !== worker.id)
      : [];
    const { provider, model, apiKey } = this.data.settings;
    const payload = {
      task: { id: task.id, description: task.description },
      worker: { ...worker, sessionId: workerSessionId(worker.id) },
      teammates: teammates.map((w) => ({ ...w, sessionId: workerSessionId(w.id) })),
      llm: { provider, model },
      filesDir: this.opts.filesDir,
    };
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
      CREWAI_TRACING_ENABLED: 'false',
      CREWAI_DISABLE_TELEMETRY: 'true',
      OTEL_SDK_DISABLED: 'true',
      [provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']: apiKey,
    };

    let child: ChildProcess;
    try {
      child = spawn(this.opts.pythonPath!, [this.opts.runnerPath], {
        env,
        cwd: this.opts.filesDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.finishTask(task, 'failed', undefined, `Görev başlatılamadı: ${String(err)}`);
      return;
    }
    this.running.set(task.id, child);
    console.log(`[Pixel Agents] Workers: ${worker.name} started task ${task.id}`);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf-8')));
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString('utf-8')).slice(-WORKER_TASK_TEXT_MAX_LENGTH);
    });
    const timeout = setTimeout(() => {
      if (task.status !== 'running') return;
      this.finishTask(task, 'failed', undefined, 'Görev çok uzun sürdü ve durduruldu.');
      child.kill();
    }, WORKER_TASK_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timeout);
      this.running.delete(task.id);
      if (task.status === 'running') {
        this.finishTask(task, 'failed', undefined, `Görev başlatılamadı: ${err.message}`);
      }
    });
    child.on('close', () => {
      clearTimeout(timeout);
      this.running.delete(task.id);
      if (task.status !== 'running') return; // stopped or timed out already
      const result = parseRunnerResult(stdout);
      if (result?.ok) {
        this.finishTask(task, 'done', result.output ?? '');
      } else {
        this.finishTask(
          task,
          'failed',
          undefined,
          result?.error ?? (lastLines(stderr) || 'Görev beklenmedik şekilde sonlandı.'),
        );
      }
    });
    child.stdin?.on('error', () => {
      /* runner exited before reading its input; 'close' reports it */
    });
    child.stdin?.end(JSON.stringify(payload));
  }

  private finishTask(
    task: WorkerTask,
    status: WorkerTask['status'],
    output?: string,
    error?: string,
  ): void {
    task.status = status;
    task.finishedAt = Date.now();
    if (output !== undefined) task.output = output.slice(0, WORKER_TASK_TEXT_MAX_LENGTH);
    if (error !== undefined) task.error = error.slice(0, WORKER_TASK_TEXT_MAX_LENGTH);
    this.save();
    // The runner normally ends the turn itself; this covers a crash or a stop
    // so the character never keeps typing on a task that is over.
    this.runtime.handleHookEvent(CREWAI_PROVIDER_ID, {
      hook_event_name: 'Stop',
      session_id: workerSessionId(task.workerId),
    });
    console.log(`[Pixel Agents] Workers: task ${task.id} ${status}`);
  }

  // ── Characters ──

  private syncCharacter(worker: Worker): void {
    const existingId = this.characters.get(worker.id);
    const existing = existingId !== undefined ? this.store.get(existingId) : undefined;
    if (
      existing &&
      existing.folderName === worker.name &&
      existing.palette === worker.palette &&
      (existing.hueShift ?? 0) === worker.hueShift
    ) {
      return;
    }
    // A new look or name re-creates the character (the office has no message
    // for restyling a live one); it walks back in with the spawn effect.
    if (existing) this.removeCharacter(worker.id);

    const sessionId = workerSessionId(worker.id);
    const id = this.store.nextAgentId.current++;
    const agent: AgentState = {
      id,
      sessionId,
      terminalRef: undefined,
      isExternal: false,
      isWorker: true,
      projectDir: this.opts.filesDir,
      jsonlFile: '',
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      isWaiting: false,
      permissionSent: false,
      hadToolsInTurn: false,
      hookDelivered: true,
      hooksOnly: true,
      providerId: CREWAI_PROVIDER_ID,
      lastDataAt: Date.now(),
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      folderName: worker.name,
      palette: worker.palette,
      hueShift: worker.hueShift,
      contextTokens: 0,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
    };
    this.store.set(id, agent);
    this.runtime.registerAgent(sessionId, id);
    this.characters.set(worker.id, id);
  }

  private removeCharacter(workerId: string): void {
    const agentId = this.characters.get(workerId);
    if (agentId === undefined) return;
    this.characters.delete(workerId);
    this.runtime.unregisterAgent(workerSessionId(workerId));
    this.runtime.removeAgent(agentId);
  }

  private save(): void {
    try {
      writeWorkersData(this.data, this.dataPath);
    } catch (err) {
      console.error(`[Pixel Agents] Workers: could not save ${this.dataPath}: ${String(err)}`);
    }
  }
}

function lastLines(text: string, count = 12): string {
  return text.trim().split('\n').slice(-count).join('\n');
}

/** Find the runner's final result line in its stdout. */
export function parseRunnerResult(
  stdout: string,
): { ok: boolean; output?: string; error?: string } | undefined {
  const index = stdout.lastIndexOf(WORKER_RESULT_MARKER);
  if (index < 0) return undefined;
  const line = stdout.slice(index + WORKER_RESULT_MARKER.length).split('\n')[0];
  try {
    const parsed = JSON.parse(line) as { ok?: unknown; output?: unknown; error?: unknown };
    return {
      ok: parsed.ok === true,
      output: typeof parsed.output === 'string' ? parsed.output : undefined,
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
    };
  } catch {
    return undefined;
  }
}
