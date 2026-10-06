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

/** Tool name the CrewAI listener reports while an agent works on a task. Must
 *  not be 'Task' or 'Agent': the office treats those as Claude sub-agent spawns
 *  and would put a duplicate Subtask character next to the worker. */
export const CREWAI_TASK_TOOL_NAME = 'CrewTask';

/** Friendly status labels for the tools office workers get (server/workers/runner.py)
 *  and CrewAI's built-in delegation tools, keyed by lower-cased tool name. */
export const CREWAI_TOOL_STATUS_LABELS: Readonly<Record<string, string>> = {
  read_web_page: 'Web sayfası okuyor',
  list_files: 'Dosyalara bakıyor',
  read_file: 'Dosya okuyor',
  write_file: 'Dosya yazıyor',
  'delegate work to coworker': 'İşi ekip arkadaşına veriyor',
  'ask question to coworker': 'Ekip arkadaşına soruyor',
};

/** Max characters of a tool status label above a CrewAI character. */
export const CREWAI_TOOL_STATUS_MAX_LENGTH = 40;
