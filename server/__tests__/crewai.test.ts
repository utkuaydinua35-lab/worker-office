import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import {
  formatCrewAIToolStatus,
  normalizeCrewAIHookEvent,
} from '../src/providers/hook/crewai/crewai.js';

describe('normalizeCrewAIHookEvent', () => {
  it('maps SessionStart with the agent role as agentName', () => {
    expect(
      normalizeCrewAIHookEvent({
        hook_event_name: 'SessionStart',
        session_id: 's1',
        cwd: '/w',
        agent_role: 'Researcher',
      }),
    ).toEqual({
      sessionId: 's1',
      event: { kind: 'sessionStart', source: 'startup', cwd: '/w', agentName: 'Researcher' },
    });
  });

  it('maps tool, turn and session-end events', () => {
    const base = { session_id: 's1' };
    expect(
      normalizeCrewAIHookEvent({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Search' })
        ?.event.kind,
    ).toBe('toolStart');
    expect(normalizeCrewAIHookEvent({ ...base, hook_event_name: 'PostToolUse' })?.event.kind).toBe(
      'toolEnd',
    );
    expect(normalizeCrewAIHookEvent({ ...base, hook_event_name: 'Stop' })?.event.kind).toBe(
      'turnEnd',
    );
    expect(normalizeCrewAIHookEvent({ ...base, hook_event_name: 'SessionEnd' })?.event).toEqual({
      kind: 'sessionEnd',
      reason: 'exit',
    });
  });

  it('drops unknown events and payloads without a session', () => {
    expect(normalizeCrewAIHookEvent({ session_id: 's1', hook_event_name: 'Bogus' })).toBeNull();
    expect(normalizeCrewAIHookEvent({ hook_event_name: 'Stop' })).toBeNull();
  });

  it('formats tool status labels', () => {
    expect(formatCrewAIToolStatus('Task', { description: 'Write report' })).toBe(
      'Working on: Write report',
    );
    expect(formatCrewAIToolStatus('SerperDevTool')).toBe('Using SerperDevTool');
  });
});

describe('AgentRuntime -- CrewAI events', () => {
  let runtime: AgentRuntime | undefined;

  afterEach(() => runtime?.dispose());

  it('adopts a CrewAI agent as a hooks-only character labelled by its role, then removes it', () => {
    const store = new AgentStateStore();
    const broadcasts: Array<Record<string, unknown>> = [];
    store.on('broadcast', (msg) => broadcasts.push(msg as Record<string, unknown>));
    runtime = new AgentRuntime(store, claudeProvider);
    // Watch All Sessions stays OFF and the dir is untracked: the CrewAI
    // listener posting to us is the opt-in.
    const cwd = path.join(os.tmpdir(), `pxl-crewai-${crypto.randomUUID()}`);
    const sid = `crew-${crypto.randomUUID()}`;

    runtime.handleHookEvent('crewai', {
      hook_event_name: 'SessionStart',
      session_id: sid,
      cwd,
      agent_role: 'Senior Researcher',
    });
    expect(store.size).toBe(0); // pending until a confirmation event

    runtime.handleHookEvent('crewai', {
      hook_event_name: 'PreToolUse',
      session_id: sid,
      tool_name: 'SerperDevTool',
    });
    expect(store.size).toBe(1);
    const [agent] = [...store.values()];
    expect(agent.hooksOnly).toBe(true);
    expect(agent.folderName).toBe('Senior Researcher');
    expect(broadcasts).toContainEqual(
      expect.objectContaining({ type: 'agentToolStart', status: 'Using SerperDevTool' }),
    );

    runtime.handleHookEvent('crewai', { hook_event_name: 'SessionEnd', session_id: sid });
    expect(store.size).toBe(0);
  });
});
