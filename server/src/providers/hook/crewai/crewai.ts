/**
 * CrewAI HookProvider.
 *
 * Unlike Claude Code, CrewAI has no settings file to install hooks into: the
 * integration is opt-in on the CrewAI side, where a Python event listener
 * (`crewai.integrations.pixel_agents`) reads `~/.pixel-agents/server.json` and
 * POSTs to `/api/hooks/crewai`. Each CrewAI Agent of a running crew is its own
 * session, so every crew member becomes its own character in the office.
 *
 * Wire format (one JSON object per POST, snake_case like Claude's hooks):
 *   { session_id, hook_event_name, cwd?, agent_role?, tool_name?, tool_input?, reason? }
 * hook_event_name ∈ CREWAI_HOOK_EVENTS.
 */

import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import {
  CREWAI_HOOK_EVENTS,
  CREWAI_PROVIDER_ID,
  CREWAI_TOOL_STATUS_MAX_LENGTH,
} from './constants.js';

type CrewAIHookEventName = (typeof CREWAI_HOOK_EVENTS)[number];

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function truncate(s: string): string {
  return s.length > CREWAI_TOOL_STATUS_MAX_LENGTH
    ? s.slice(0, CREWAI_TOOL_STATUS_MAX_LENGTH) + '…'
    : s;
}

export function normalizeCrewAIHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const sessionId = str(raw.session_id);
  const name = str(raw.hook_event_name) as CrewAIHookEventName | undefined;
  if (!sessionId || !name) return null;

  switch (name) {
    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: str(raw.source) ?? 'startup',
          cwd: str(raw.cwd),
          agentName: str(raw.agent_role),
        },
      };
    case 'PreToolUse':
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: str(raw.tool_use_id) ?? `crewai-${Date.now()}`,
          toolName: str(raw.tool_name) ?? 'Tool',
          input: raw.tool_input,
        },
      };
    case 'PostToolUse':
      return { sessionId, event: { kind: 'toolEnd', toolId: str(raw.tool_use_id) ?? '' } };
    case 'Stop':
      return { sessionId, event: { kind: 'turnEnd' } };
    case 'SessionEnd':
      return { sessionId, event: { kind: 'sessionEnd', reason: str(raw.reason) ?? 'exit' } };
    default:
      return null;
  }
}

export function formatCrewAIToolStatus(toolName: string, input?: unknown): string {
  if (toolName === 'Task') {
    const desc = str((input as Record<string, unknown> | undefined)?.description);
    return desc ? truncate(`Working on: ${desc}`) : 'Working on task';
  }
  return truncate(`Using ${toolName}`);
}

export const crewaiProvider: HookProvider = {
  kind: 'hook',
  id: CREWAI_PROVIDER_ID,
  displayName: 'CrewAI',
  protocolVersion: 1,

  normalizeHookEvent: normalizeCrewAIHookEvent,

  // Nothing to install on our side: the CrewAI listener is enabled in the
  // user's own Python code, which is the consent.
  async installHooks() {},
  async uninstallHooks() {},
  async areHooksInstalled() {
    return false;
  },
  consentDisclosure() {
    return {
      headline: 'CrewAI',
      disclosure:
        'Pixel Agents writes nothing for CrewAI. Crews opt in from Python with ' +
        '`crewai.integrations.pixel_agents.enable()`, which POSTs agent and tool ' +
        'activity to this local server. Remove that call to stop.',
    };
  },

  formatToolStatus: formatCrewAIToolStatus,
  permissionExemptTools: new Set(['Task']),
  subagentToolNames: new Set(),
  readingTools: new Set(),
};
