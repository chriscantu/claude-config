import { expect, test } from 'claude-code/testing'

const CORE = { plugin: 'engine', tier: 'core' } as const

test('a listed tool moves behind ToolSearch with its description intact', async ($, on) => {
  // Stands for the engine: Artifact listed in the prompt, not deferred.
  on('tool.describe', (_, e) => ({ description: e.description }))

  const r = await $.tool.describe({ tool: 'Artifact', description: 'long text', provider: CORE })

  expect(r.isDeferred).toBe(true)
  expect(r.description).toBe('long text')
})

test('a tool not on the list keeps its placement', async ($, on) => {
  on('tool.describe', (_, e) => ({ description: e.description }))

  const r = await $.tool.describe({ tool: 'Bash', description: 'run shell', provider: CORE })

  expect(r.isDeferred).toBeUndefined()
})
