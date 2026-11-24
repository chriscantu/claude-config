import type { Register } from 'claude-code'

// Built-in tools whose descriptions are long but which this toolkit's sessions
// rarely call. Deferred, each costs one ToolSearch round trip when used instead
// of ~1-7k tokens on every request. Measured in docs/research/2026-11-24-mods-token-study.md.
const DEFERRED = ['Artifact', 'Workflow', 'ScheduleWakeup', 'ReportFindings']

export const register: Register = on => {
  for (const tool of DEFERRED) {
    on('tool.describe', { tool }, async ($, e, next) => ({ ...(await next(e)), isDeferred: true }))
  }
}
