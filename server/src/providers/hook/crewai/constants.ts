/** CrewAI-specific constants (see providers/hook/claude/constants.ts for the pattern). */

/** Provider id — the `:providerId` segment the CrewAI listener POSTs to. */
export const CREWAI_PROVIDER_ID = 'crewai';

/** Event names the CrewAI listener sends. */
export const CREWAI_HOOK_EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionEnd',
] as const;

/** Max characters of a tool status label above a CrewAI character. */
export const CREWAI_TOOL_STATUS_MAX_LENGTH = 40;
