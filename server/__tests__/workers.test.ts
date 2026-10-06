import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { createHttpServer } from '../src/httpServer.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import {
  parseRunnerResult,
  WorkerError,
  WorkerService,
  workerSessionId,
} from '../src/workers/workerService.js';
import { readWorkersData } from '../src/workers/workerStore.js';

/** A stand-in for runner.py: echoes the task back as its result. */
const FAKE_RUNNER = `
import json, sys
payload = json.loads(sys.stdin.read())
print("@@WORKER_RESULT@@" + json.dumps({"ok": True, "output": "bitti: " + payload["task"]["description"]}))
`;

async function waitFor(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('WorkerService', () => {
  let dir: string;
  let store: AgentStateStore;
  let runtime: AgentRuntime;
  let service: WorkerService;

  function makeService(pythonPath: string | undefined = 'python3'): WorkerService {
    const runnerPath = path.join(dir, 'runner.py');
    fs.writeFileSync(runnerPath, FAKE_RUNNER);
    const resolvedPython =
      pythonPath === 'python3'
        ? (['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'].find((p) =>
            fs.existsSync(p),
          ) ?? 'python3')
        : pythonPath;
    return new WorkerService(store, runtime, {
      pythonPath: resolvedPython,
      runnerPath,
      filesDir: path.join(dir, 'files'),
      dataPath: path.join(dir, 'workers.json'),
    });
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-workers-'));
    store = new AgentStateStore();
    runtime = new AgentRuntime(store, claudeProvider);
    service = makeService();
    service.start();
  });

  afterEach(() => {
    service.dispose();
    runtime.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('puts a new worker in the office as a character with its name and look', () => {
    const worker = service.createWorker({ name: 'Ayşe', role: 'Araştırmacı', palette: 3 });
    const [agent] = [...store.values()];
    expect(agent.sessionId).toBe(workerSessionId(worker.id));
    expect(agent.folderName).toBe('Ayşe');
    expect(agent.palette).toBe(3);
    expect(agent.isExternal).toBe(false);
  });

  it('re-creates the character when the look changes and removes it on delete', () => {
    const worker = service.createWorker({ name: 'Ayşe' });
    const firstId = [...store.keys()][0];
    service.updateWorker(worker.id, { hueShift: 120 });
    expect([...store.keys()]).not.toContain(firstId);
    expect([...store.values()][0].hueShift).toBe(120);
    service.deleteWorker(worker.id);
    expect(store.size).toBe(0);
  });

  it('rejects out-of-range or junk input instead of storing it', () => {
    const worker = service.createWorker({
      name: 'Ayşe',
      palette: 99,
      hueShift: -5,
      permissions: 'x',
    });
    expect(worker.palette).toBeGreaterThanOrEqual(0);
    expect(worker.palette).toBeLessThan(6);
    expect(worker.hueShift).toBe(0);
    expect(worker.permissions).toEqual({ readWeb: true, files: true, delegate: false });
  });

  it('refuses a task until an API key is set, and never exposes the key', () => {
    const worker = service.createWorker({ name: 'Ayşe' });
    expect(() => service.assignTask(worker.id, 'Merhaba')).toThrow(WorkerError);
    service.updateSettings({ apiKey: 'sk-secret' });
    const view = service.view();
    expect(view.settings.hasApiKey).toBe(true);
    expect(JSON.stringify(view)).not.toContain('sk-secret');
    // An empty key in a later save keeps the stored one.
    service.updateSettings({ apiKey: '', model: 'claude-sonnet-5-5' });
    expect(service.view().settings).toMatchObject({ hasApiKey: true, model: 'claude-sonnet-5-5' });
  });

  it('runs a task through the runner and stores its output', async () => {
    const worker = service.createWorker({ name: 'Ayşe' });
    service.updateSettings({ apiKey: 'sk-secret' });
    const task = service.assignTask(worker.id, 'rapor yaz');
    expect(service.view().workers[0].busy).toBe(true);
    expect(() => service.assignTask(worker.id, 'ikinci iş')).toThrow(/başka bir görevde/);
    await waitFor(() => service.view().tasks[0].status !== 'running');
    const done = service.view().tasks.find((t) => t.id === task.id)!;
    expect(done.status).toBe('done');
    expect(done.output).toBe('bitti: rapor yaz');
    // Persisted, and the key file is owner-only.
    const file = path.join(dir, 'workers.json');
    expect(readWorkersData(file).tasks[0].output).toBe('bitti: rapor yaz');
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o077).toBe(0);
  });

  it('reports a missing Python runtime instead of failing a task silently', () => {
    service.dispose();
    service = makeService('/nonexistent/python');
    expect(service.view().ready).toBe(false);
    const worker = service.createWorker({ name: 'Ayşe' });
    service.updateSettings({ apiKey: 'sk' });
    expect(() => service.assignTask(worker.id, 'x')).toThrow(/kurulu değil/);
  });

  it('restores workers and their characters from disk on start', () => {
    service.createWorker({ name: 'Ayşe' });
    service.dispose();
    runtime.dispose();
    store = new AgentStateStore();
    runtime = new AgentRuntime(store, claudeProvider);
    service = makeService();
    service.start();
    expect([...store.values()].map((a) => a.folderName)).toEqual(['Ayşe']);
  });
});

describe('parseRunnerResult', () => {
  it('reads the last result line and ignores other output', () => {
    expect(parseRunnerResult('log\n@@WORKER_RESULT@@{"ok":true,"output":"x"}\n')).toEqual({
      ok: true,
      output: 'x',
      error: undefined,
    });
    expect(parseRunnerResult('no marker')).toBeUndefined();
    expect(parseRunnerResult('@@WORKER_RESULT@@{broken')).toBeUndefined();
  });
});

describe('/api/workers', () => {
  it('requires the server token and serves the view with it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-workers-http-'));
    const store = new AgentStateStore();
    const runtime = new AgentRuntime(store, claudeProvider);
    const workers = new WorkerService(store, runtime, {
      runnerPath: path.join(dir, 'runner.py'),
      filesDir: path.join(dir, 'files'),
      dataPath: path.join(dir, 'workers.json'),
    });
    const { app } = await createHttpServer({ embedded: true, token: 'tok', store, workers });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/workers' })).statusCode).toBe(401);
      const auth = { authorization: 'Bearer tok' };
      const created = await app.inject({
        method: 'POST',
        url: '/api/workers',
        headers: auth,
        payload: { name: 'Mehmet', role: 'Yazar' },
      });
      expect(created.statusCode).toBe(200);
      expect(created.json().workers[0]).toMatchObject({ name: 'Mehmet', role: 'Yazar' });
      const missing = await app.inject({
        method: 'PUT',
        url: '/api/workers/nope',
        headers: auth,
        payload: {},
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error).toBe('Worker bulunamadı.');
    } finally {
      await app.close();
      runtime.dispose();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
