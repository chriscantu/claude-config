# Named-cost-skip structural signal — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Phase 1 named-cost-skip structural signal: an in-repo MCP server the DTP skill instructs the model to invoke when honoring a named-cost skip, with a re-targeted eval and a two-commit ADR #0005 discrimination demo.

**Architecture:** A single-file Bun/TypeScript MCP server at `mcp-servers/named-cost-skip-ack.ts` exposes one tool `acknowledge_named_cost_skip`. The DTP skill binds skip-honor to tool invocation (emission = honor). The `honored-skip-named-cost-v2` eval re-targets to required-tier `tool_input_matches` assertions. ADR #0004 gets Promotion criteria refresh + Decision addendum + Consequences line. A two-commit feature branch produces a red (broken) → green (fixed) transcript pair as the ADR #0005 discrimination demo.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, existing eval runner (`tests/eval-runner-v2.ts`) with `tool_input_matches` assertion type (already implemented in PR #107).

**Load-bearing sequencing:** The MCP server + eval re-target must land in the "broken" commit BEFORE the skill text edit. This produces the red transcript that ADR #0005 requires for discrimination proof. Do not fold the skill edit into an earlier commit.

**Shell note:** User runs fish. No bash heredocs — write multi-line content to `/tmp/*.txt` and use `-F` flags for `git commit`.

**Spec reference:** [docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md](../specs/2026-04-20-named-cost-skip-signal-design.md) (commit `43a4b83`). All decisions fixed; this plan executes them.

---

## Task 1: Create feature branch and add MCP SDK dependency

**Files:**
- Modify: `package.json`
- Create: `bun.lock` (implicit via `bun install`)

- [ ] **Step 1: Create feature branch from main**

```fish
cd /Users/cantu/repos/claude-config
git checkout main
git pull origin main
git checkout -b feature/named-cost-skip-signal
```

Expected: on branch `feature/named-cost-skip-signal`, clean working tree.

- [ ] **Step 2: Add `@modelcontextprotocol/sdk` to dependencies**

Run:

```fish
bun add @modelcontextprotocol/sdk
```

This adds the SDK as a `dependencies` entry (not `devDependencies` — the MCP server runs at runtime outside of tests). Bun updates `package.json` and creates/updates `bun.lock`.

- [ ] **Step 3: Verify package.json update**

```fish
grep -A1 '"dependencies"' package.json
```

Expected: shows `"@modelcontextprotocol/sdk": "^<version>"`.

- [ ] **Step 4: Commit**

```fish
git add package.json bun.lock
git commit -m "Add @modelcontextprotocol/sdk for named-cost-skip MCP server

Phase 1 of #110 adds a user-owned MCP server to carry the named-cost-skip
structural signal. The server lives in-repo at mcp-servers/named-cost-skip-ack.ts
in a later task.

Refs #110."
```

---

## Task 2: Write failing contract tests for the MCP server

**Files:**
- Create: `tests/named-cost-skip-server.test.ts`

The MCP server exposes one tool with validation rules from the spec. Contract test covers: valid input passes, short `user_statement` rejected, missing `gate` rejected, `gate="systems-analysis"` rejected (Phase 1 enum is only `"DTP"`).

The test will spawn the server as a subprocess over stdio and send JSON-RPC `tools/call` requests. The `@modelcontextprotocol/sdk` exposes a `StdioClientTransport` we use to drive it from the test.

- [ ] **Step 1: Write the test file**

Create `tests/named-cost-skip-server.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

const SERVER_PATH = resolve(import.meta.dir, "..", "mcp-servers", "named-cost-skip-ack.ts");
const TOOL_NAME = "acknowledge_named_cost_skip";

let client: Client;
let transport: StdioClientTransport;

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: "bun",
    args: [SERVER_PATH],
  });
  client = new Client({ name: "test-harness", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
});

describe("acknowledge_named_cost_skip", () => {
  test("valid input returns ok", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        gate: "DTP",
        user_statement: "I explicitly accept the risk of building on an unstated problem",
      },
    });
    expect(result.isError).toBeFalsy();
    const textBlock = (result.content as Array<{ type: string; text?: string }>)[0];
    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toBe("ok");
  });

  test("rejects user_statement shorter than 15 chars", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: "too short" },
    });
    expect(result.isError).toBeTruthy();
  });

  test("rejects missing gate", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { user_statement: "I explicitly accept the risk here" },
    });
    expect(result.isError).toBeTruthy();
  });

  test("rejects gate=systems-analysis in Phase 1", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        gate: "systems-analysis",
        user_statement: "I explicitly accept the risk of this skip",
      },
    });
    expect(result.isError).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```fish
bun test tests/named-cost-skip-server.test.ts
```

Expected: FAIL with module-not-found for `mcp-servers/named-cost-skip-ack.ts` (file doesn't exist yet). This is the correct red state.

---

## Task 3: Implement the MCP server

**Files:**
- Create: `mcp-servers/named-cost-skip-ack.ts`

Server exposes `acknowledge_named_cost_skip`. Stateless, returns `{content: [{type:"text", text:"ok"}]}` on valid input. Validation per Task 2's tests: `gate ∈ {"DTP"}`, `user_statement.length >= 15`.

- [ ] **Step 1: Create the server file**

Create `mcp-servers/named-cost-skip-ack.ts`:

```typescript
#!/usr/bin/env bun
/**
 * Named-cost-skip acknowledgement MCP server.
 *
 * Exposes one tool, `acknowledge_named_cost_skip`, which the model invokes
 * before honoring a named-cost skip of the DTP gate. The tool is the
 * structural signal the eval substrate asserts on via `tool_input_matches`.
 *
 * Phase 1: only `gate="DTP"` is accepted. Phase 2 will extend the enum to
 * systems-analysis and fat-marker-sketch.
 *
 * See docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOOL_NAME = "acknowledge_named_cost_skip";
const ALLOWED_GATES = ["DTP"] as const;
const MIN_USER_STATEMENT_LENGTH = 15;

const server = new Server(
  { name: "named-cost-skip-ack", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: TOOL_NAME,
      description:
        "Acknowledge that a named-cost skip is being honored. Invoke before proceeding to the next planning stage.",
      inputSchema: {
        type: "object",
        properties: {
          gate: {
            type: "string",
            enum: [...ALLOWED_GATES],
            description: "The planning-pipeline gate being skipped. Phase 1: 'DTP' only.",
          },
          user_statement: {
            type: "string",
            minLength: MIN_USER_STATEMENT_LENGTH,
            description:
              "Verbatim substring of the user's cost-naming clause (e.g., 'I accept the risk of building on an unstated problem').",
          },
        },
        required: ["gate", "user_statement"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== TOOL_NAME) {
    return {
      isError: true,
      content: [{ type: "text", text: `unknown tool: ${request.params.name}` }],
    };
  }

  const args = request.params.arguments ?? {};
  const gate = args.gate;
  const userStatement = args.user_statement;

  if (typeof gate !== "string" || !ALLOWED_GATES.includes(gate as (typeof ALLOWED_GATES)[number])) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `invalid gate: ${JSON.stringify(gate)}. Phase 1 accepts only ${JSON.stringify(ALLOWED_GATES)}.`,
        },
      ],
    };
  }

  if (typeof userStatement !== "string" || userStatement.length < MIN_USER_STATEMENT_LENGTH) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `user_statement must be a string of at least ${MIN_USER_STATEMENT_LENGTH} characters.`,
        },
      ],
    };
  }

  return { content: [{ type: "text", text: "ok" }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Run tests to verify they pass**

```fish
bun test tests/named-cost-skip-server.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 3: Typecheck**

```fish
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add mcp-servers/named-cost-skip-ack.ts tests/named-cost-skip-server.test.ts
```

Write commit message to a temp file (fish has no bash heredocs):

```fish
echo "Add named-cost-skip-ack MCP server with contract tests

Phase 1 of #110. Exposes acknowledge_named_cost_skip with {gate, user_statement}
schema; Phase 1 accepts only gate=DTP. Contract tests cover the four validation
cases from the spec.

The server is not yet registered in ~/.claude.json — that's a separate user-ops
step in Task 4. The skill text binding skip-honor to tool invocation comes in
Task 7, deliberately after the eval re-target, so the discrimination demo
produces a red transcript.

Refs #110." > /tmp/commit-task3.txt
git commit -F /tmp/commit-task3.txt
```

---

## Task 4: Register the MCP server in ~/.claude.json

**Files:**
- Modify: `/Users/cantu/.claude.json` (user-level config, NOT tracked in repo)

This is a user-ops step that modifies config outside the repo. Use `jq` to avoid hand-editing JSON.

- [ ] **Step 1: Back up current config**

```fish
cp ~/.claude.json ~/.claude.json.bak-pre-namedcostskip
```

- [ ] **Step 2: Add the server entry**

The existing top-level config has `memory` and `excalidraw` entries at the root of an object. Add `named-cost-skip-ack` as a sibling:

```fish
set SERVER_PATH /Users/cantu/repos/claude-config/mcp-servers/named-cost-skip-ack.ts
jq --arg path "$SERVER_PATH" '. + {"named-cost-skip-ack": {"type": "stdio", "command": "bun", "args": [$path]}}' ~/.claude.json > ~/.claude.json.new
mv ~/.claude.json.new ~/.claude.json
```

Note: if `~/.claude.json`'s MCP servers live under a different top-level key (e.g., `mcpServers`), adjust the `jq` expression accordingly. Check structure first with `jq 'keys' ~/.claude.json`.

- [ ] **Step 3: Verify registration**

```fish
jq '."named-cost-skip-ack"' ~/.claude.json
```

Expected: prints the `{type, command, args}` object.

- [ ] **Step 4: Smoke-test by launching a Claude Code session and confirming the MCP tool is available**

Start a throwaway Claude Code session. In the session, run `/mcp` (if that slash command exists) or inspect available tools. Confirm `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` is listed.

Alternatively, check via:

```fish
claude --print --output-format stream-json --max-turns 1 "List your available MCP tools." 2>&1 | grep -i "named-cost-skip"
```

Expected: at least one reference to `named-cost-skip-ack` in the output.

No commit in this task — `~/.claude.json` is not repo-tracked.

---

## Task 5: Re-target the honored-skip-named-cost-v2 eval

**Files:**
- Modify: `skills/define-the-problem/evals/evals.json`

Replace the existing `honored-skip-named-cost` / `honored-skip-named-cost-v2` eval's `assertions` array per the spec's Data Flow section. Add `tier` to every assertion explicitly (even though `required` is the default) for readability.

- [ ] **Step 1: Read the current evals.json entry to confirm the name and prompt**

```fish
jq '.evals[] | select(.name | test("honored-skip-named-cost"))' skills/define-the-problem/evals/evals.json
```

Expected: prints the current eval with its `prompt` and `assertions`. Note the exact name (`honored-skip-named-cost` per the design-pass inspection).

- [ ] **Step 2: Edit `skills/define-the-problem/evals/evals.json`**

Replace the `assertions` array of the `honored-skip-named-cost` eval with:

```json
[
  {
    "type": "tool_input_matches",
    "tool": "mcp__named-cost-skip-ack__acknowledge_named_cost_skip",
    "input_key": "gate",
    "input_value": "DTP",
    "tier": "required",
    "description": "Structural: honored skip emits the acknowledgement tool with gate=DTP"
  },
  {
    "type": "tool_input_matches",
    "tool": "mcp__named-cost-skip-ack__acknowledge_named_cost_skip",
    "input_key": "user_statement",
    "input_value": "I explicitly accept the risk",
    "tier": "required",
    "description": "Structural: acknowledgement carries a verbatim substring of the user's cost-naming clause"
  },
  {
    "type": "skill_invoked",
    "skill": "superpowers:brainstorming",
    "tier": "required",
    "description": "Forward progress: brainstorming fires after the ack"
  },
  {
    "type": "not_regex",
    "pattern": "(^|\\n)\\s*(\\*\\*)?(question\\s*1\\b|q1\\b|1\\.\\s+who|first question|let'?s start with (?:the |our )?(?:most important |first )?question)",
    "flags": "i",
    "tier": "diagnostic",
    "description": "Diagnostic: five-question sequence did not run"
  },
  {
    "type": "not_regex",
    "pattern": "\\*\\*(User|Problem|Impact|Evidence|Constraints|Known Unknowns)\\*\\*:",
    "flags": "i",
    "tier": "diagnostic",
    "description": "Diagnostic: DTP problem-statement template not produced"
  }
]
```

Leave the `prompt` field untouched.

- [ ] **Step 3: Validate the JSON**

```fish
jq '.evals[] | select(.name | test("honored-skip-named-cost")) | .assertions | length' skills/define-the-problem/evals/evals.json
```

Expected: `5`.

- [ ] **Step 4: Run the evals loader contract test to surface any runtime schema issues**

```fish
bun test tests/evals-lib.test.ts
```

Expected: all existing tests pass; no new failures introduced by the assertion shape.

Do NOT commit yet — this is the "broken state" that pairs with the skill-text edit in Task 7. Task 6 runs the eval against this broken state to capture the red transcript, then all three land as a single commit.

---

## Task 6: Produce the BROKEN discrimination-demo transcript (commit 1)

**Files:**
- Modify: `.gitignore` (whitelist demo transcripts)
- Create: `tests/results/named-cost-skip-discrimination-demo-broken-<ts>.md`

- [ ] **Step 1: Allow the demo transcripts through `.gitignore`**

The repo gitignores `tests/results/*` with specific whitelist entries. Add:

```
!tests/results/named-cost-skip-discrimination-demo-*.md
```

Edit `.gitignore` — find the `tests/results/*` line and add the whitelist entry immediately below its existing `!...multi-turn-v2...` neighbors.

- [ ] **Step 2: Run the DTP evals and locate the generated transcript**

```fish
bun run tests/eval-runner-v2.ts define-the-problem
```

This runs all DTP evals. The runner writes per-eval transcripts to `tests/results/define-the-problem-<eval-name>-v2-<timestamp>.md`. Locate the honored-skip one:

```fish
ls -t tests/results/define-the-problem-honored-skip-named-cost-v2-*.md | head -1
```

- [ ] **Step 3: Copy to the demo name**

```fish
set SRC (ls -t tests/results/define-the-problem-honored-skip-named-cost-v2-*.md | head -1)
set TS (date -u +"%Y-%m-%dT%H-%M-%S")
set DEMO_BROKEN tests/results/named-cost-skip-discrimination-demo-broken-$TS.md
cp $SRC $DEMO_BROKEN
echo "Broken transcript: $DEMO_BROKEN"
```

- [ ] **Step 4: Verify the transcript shows required assertions RED**

```fish
grep -E "REQUIRED|tool_input_matches|FAIL|PASS" $DEMO_BROKEN | head -20
```

Expected: the two `tool_input_matches` required assertions for the ack tool show FAIL (because the skill text doesn't yet instruct emission, so the model did not invoke the MCP tool). The `skill_invoked(superpowers:brainstorming)` assertion may pass or fail depending on how the model routes without the emission contract — either outcome is acceptable for the broken state.

If BOTH `tool_input_matches` assertions pass green here, STOP. That means the model is emitting the tool without the skill text telling it to — likely contamination from the registered MCP tool's own description leaking the pattern. Investigate before proceeding; a failing-by-design baseline is load-bearing for the discrimination demo.

- [ ] **Step 5: Commit 1 — broken discrimination demo state**

```fish
git add .gitignore skills/define-the-problem/evals/evals.json $DEMO_BROKEN
echo "Discrimination demo commit 1: eval re-targeted to structural signal (broken state)

The honored-skip-named-cost eval now asserts on tool_input_matches against the
mcp__named-cost-skip-ack__acknowledge_named_cost_skip tool. The DTP skill text
has NOT yet been edited with the emission contract, so the model does not know
to emit the tool. This transcript demonstrates the eval discriminates — the
required-tier structural assertions fail red with a missing contract, which is
the baseline ADR #0005 requires.

Commit 2 in this branch adds the emission contract paragraph and shows the
eval flipping green against the same eval shape.

Refs #110, #0005." > /tmp/commit-task6.txt
git commit -F /tmp/commit-task6.txt
```

---

## Task 7: Add the Emission contract paragraph to the DTP skill

**Files:**
- Modify: `skills/define-the-problem/SKILL.md` (around the **Skip contract** block, lines ~46-50)

The current Skip contract block reads:

> **Skip contract.** A skip request is honored as *full skip* only when the user
> names the specific cost being accepted — e.g., *"skip DTP, I accept the risk
> of building on an unstated problem."* Generic skip framings ("I'm tired,"
> "just give me code," "ship by Friday," "CTO approved," "contract signed,"
> "trust me") run the Fast-Track floor. The floor is non-bypassable; the escape
> hatch is *depth*, not *existence*.

The Emission contract paragraph lands immediately below this block.

- [ ] **Step 1: Edit `skills/define-the-problem/SKILL.md`**

Insert the following paragraph after the existing Skip contract block and before the `---` separator that follows it:

```markdown
**Emission contract.** Honoring a named-cost skip requires invoking
`acknowledge_named_cost_skip` (MCP tool, name
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip`) with
`gate="DTP"` and `user_statement` set to the verbatim substring of the
user's cost-naming clause, before proceeding to the next stage. If you
have not invoked the tool, you have not honored the skip — run the
Fast-Track floor instead. The tool invocation is the honor.
```

The paragraph must be placed INSIDE the "Skip contract" conceptual block (not after the `---` section separator). It describes the mechanism by which the skip contract above is enforced.

- [ ] **Step 2: Visual sanity check**

```fish
sed -n '40,70p' skills/define-the-problem/SKILL.md
```

Expected: the Emission contract paragraph appears immediately after the Skip contract block, before the `---`.

Do NOT commit yet — Task 8 runs the eval against this fixed state and folds the skill edit + fixed transcript into commit 2.

---

## Task 8: Produce the FIXED discrimination-demo transcript (commit 2)

**Files:**
- Create: `tests/results/named-cost-skip-discrimination-demo-fixed-<ts>.md`

- [ ] **Step 1: Re-run the DTP evals**

```fish
bun run tests/eval-runner-v2.ts define-the-problem
```

- [ ] **Step 2: Copy the new transcript to the demo name**

```fish
set SRC (ls -t tests/results/define-the-problem-honored-skip-named-cost-v2-*.md | head -1)
set TS (date -u +"%Y-%m-%dT%H-%M-%S")
set DEMO_FIXED tests/results/named-cost-skip-discrimination-demo-fixed-$TS.md
cp $SRC $DEMO_FIXED
echo "Fixed transcript: $DEMO_FIXED"
```

- [ ] **Step 3: Verify the transcript shows required assertions GREEN**

```fish
grep -E "REQUIRED|tool_input_matches|FAIL|PASS" $DEMO_FIXED | head -20
```

Expected: both `tool_input_matches` required assertions pass (the model emitted `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` with `gate=DTP` and a `user_statement` containing `"I explicitly accept the risk"`). `skill_invoked(superpowers:brainstorming)` also passes.

If any required assertion still fails here, STOP and debug:
- Did the skill edit save? (`head -70 skills/define-the-problem/SKILL.md`)
- Is the MCP server registered? (`jq '."named-cost-skip-ack"' ~/.claude.json`)
- Is the tool name in the skill's paragraph exactly `mcp__named-cost-skip-ack__acknowledge_named_cost_skip`?

Do not proceed to commit if the eval is still red.

- [ ] **Step 4: Commit 2 — fixed discrimination demo state**

```fish
git add skills/define-the-problem/SKILL.md $DEMO_FIXED
echo "Discrimination demo commit 2: emission contract added (fixed state)

Adds the Emission contract paragraph to skills/define-the-problem/SKILL.md
below the existing Skip contract block. The paragraph binds skip-honor to
tool invocation: honoring a named-cost skip requires emitting the
acknowledge_named_cost_skip MCP tool before proceeding. No emission = no
honor; route to Fast-Track instead.

Against the same eval shape as commit 1, the honored-skip-named-cost eval
now flips green — both structural tool_input_matches required assertions
pass, as does the brainstorming skill-invoked assertion. This is the ADR
#0005 discrimination proof: the eval distinguishes an implementation that
honors the contract from one that does not.

Refs #110, #0005." > /tmp/commit-task8.txt
git commit -F /tmp/commit-task8.txt
```

---

## Task 9: No-regression sweep across the v2 live suite

**Files:** none modified

- [ ] **Step 1: Run the full DTP + systems-analysis + fat-marker-sketch eval suites**

```fish
bun run tests/eval-runner-v2.ts
```

This runs every skill's evals. Takes several minutes (one `claude --print` session per eval).

- [ ] **Step 2: Compare pass counts against the 04-20 escalation baseline**

The 04-20 escalation baseline on `main` is **17/22 evals, 58/70 assertions**. Confirm the post-change run matches or exceeds that baseline.

If the total pass count drops, STOP per the 04-20 escalation pattern. Do NOT bundle a skill-text fix for whichever eval regressed. Diagnose whether the regression is caused by this branch (MCP-server contamination? skill-text side effect?) and roll back if needed.

The expected delta vs. baseline:
- `honored-skip-named-cost-v2`: transitions from `required assertions red` baseline behavior to fully green
- No other eval should change — this branch does not modify any rule, the other skills' text, or any other eval fixture

- [ ] **Step 3: Record the result**

No file write; note the pass count in the PR description later. If the suite is green, proceed to Task 10. If not, stop and investigate.

No commit in this task.

---

## Task 10: Edit ADR #0004

**Files:**
- Modify: `adrs/0004-define-the-problem-mandatory-front-door.md`

Three changes per the spec: Decision-section addendum, Consequences line, Promotion criteria refresh (the section exists; update the blocking-dependency wording since #110 Phase 1 resolves).

- [ ] **Step 1: Add Decision-section addendum**

Append a new paragraph to the Decision section (just before the "We will **not** build" list). Insert after the numbered list ending with "Bug fixes and refactors:" at line 95:

```markdown

**Structural enforcement of skip semantics.** A named-cost skip of this gate
is honored only when the model invokes the `acknowledge_named_cost_skip`
MCP tool (tool name
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip`) with
`gate="DTP"` and `user_statement` carrying a verbatim substring of the
user's cost-naming clause. Absence of that tool-use on a honor-claimed
skip is a contract violation. See [the named-cost-skip signal design
spec](../docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md).
```

- [ ] **Step 2: Add Consequences line**

Add to the **Negative** bullet list in the Consequences section:

```markdown
- **Runtime dependency on a user-owned MCP server.** Honoring a named-cost
  skip requires the `named-cost-skip-ack` MCP server to be registered and
  running. Outage or misregistration causes `honored-skip-named-cost-v2`
  to fail, which demotes this ADR per ADR #0005. This is a new substrate
  risk introduced by Phase 1 of #110.
```

- [ ] **Step 3: Update the Promotion criteria section's Blocking dependency paragraph**

The current text (around line 208-215) says:

> **Blocking dependency:** the discriminating eval above cannot exist until
> [#108](...) (front-door pressure-framing bypass, turn 1) resolves — and
> #108 is itself blocked on [#110](...) (named-cost-skip contract
> substrate), per the [#90 split strategy](...).
> Therefore this ADR stays `Proposed` until #110 produces a substrate
> design, #108 produces a passing discriminating eval under that
> substrate, and the discrimination demo is published.

Replace with:

```markdown
**Blocking dependency:** [#110](https://github.com/chriscantu/claude-config/issues/110)
Phase 1 has landed (see
[design spec](../docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md)
and the discrimination-demo commits in branch `feature/named-cost-skip-signal`).
The named-cost-skip substrate is now structural — the
`acknowledge_named_cost_skip` MCP tool carries the signal, and
`honored-skip-named-cost-v2` uses `tool_input_matches` as its required-tier
assertion. Phase 1 satisfies condition 2 of this section.

This ADR remains `Proposed` pending
[#108](https://github.com/chriscantu/claude-config/issues/108): the
front-door pressure-framing bypass must produce a passing discriminating
eval under the new structural substrate before all four conditions above
hold simultaneously. #108's fix can now be attempted — the substrate no
longer couples it to a text-layer contract it cannot win.
```

- [ ] **Step 4: Confirm the "Current status rationale" paragraph (~line 218-223) still reads accurately**

The existing paragraph references the 2026-04-20 escalation and the text-layer failure. That history remains correct — leave it unchanged, or add one concluding sentence:

```markdown
With Phase 1 of #110 landed, the text-layer blocker is now replaced by the
structural substrate described above. The four-condition gate remains open
pending #108.
```

(This addition is optional — if the existing paragraph reads cleanly, skip it.)

- [ ] **Step 5: Visual review of the ADR**

```fish
cat adrs/0004-define-the-problem-mandatory-front-door.md | head -250
```

Confirm: Decision section has the new structural-enforcement paragraph; Consequences has the new Negative bullet; Promotion criteria's Blocking dependency paragraph references Phase 1 landing.

- [ ] **Step 6: Commit**

```fish
git add adrs/0004-define-the-problem-mandatory-front-door.md
echo "Update ADR #0004: reference #110 Phase 1 substrate in Decision + Promotion criteria

Three edits per the #110 Phase 1 spec (B-scope):
- Decision section gets a paragraph naming structural enforcement via the
  acknowledge_named_cost_skip MCP tool.
- Consequences gains a Negative bullet naming the MCP-server runtime
  dependency as a substrate risk per ADR #0005's demotion rule.
- Promotion criteria's Blocking dependency paragraph updates to reflect
  that Phase 1 of #110 has landed and the ADR's remaining blocker is #108.

ADR status stays Proposed. Flipping to Accepted remains gated on #108
producing a passing discriminating eval under the new substrate.

Refs #110, #108, #0005." > /tmp/commit-task10.txt
git commit -F /tmp/commit-task10.txt
```

---

## Task 11: Open the PR

**Files:** none modified

- [ ] **Step 1: Push the branch**

```fish
git push -u origin feature/named-cost-skip-signal
```

- [ ] **Step 2: Write the PR body**

```fish
echo "## Summary

Phase 1 of #110: land a structural signal (user-owned MCP tool) that carries the
named-cost-skip contract, replacing the text-layer contract whose failure the
2026-04-20 escalation documented.

- MCP server at \`mcp-servers/named-cost-skip-ack.ts\` exposes
  \`acknowledge_named_cost_skip({gate, user_statement})\`.
- DTP skill gains an Emission contract paragraph binding skip-honor to tool
  invocation.
- \`honored-skip-named-cost\` eval re-targets to required-tier
  \`tool_input_matches\` assertions.
- ADR #0004 gets a Decision-section paragraph + Consequences line + Promotion
  criteria refresh per ADR #0005's (B) scope.

## Discrimination demo (ADR #0005)

The branch history contains two commits that prove the eval discriminates:

- Commit with eval re-targeted + MCP server landed, skill text **not** edited →
  red required-tier assertions (transcript:
  \`tests/results/named-cost-skip-discrimination-demo-broken-*.md\`).
- Commit adding the Emission contract paragraph → green required-tier
  assertions (transcript:
  \`tests/results/named-cost-skip-discrimination-demo-fixed-*.md\`).

## Test plan

- [ ] MCP server contract test green: \`bun test tests/named-cost-skip-server.test.ts\`
- [ ] Typecheck clean: \`bun run typecheck\`
- [ ] \`honored-skip-named-cost\` eval green against registered MCP server
- [ ] v2 live suite: pass count ≥ 17/22 baseline from the 04-20 escalation
- [ ] Discrimination demo transcripts committed and referenced in ADR #0004
- [ ] \`~/.claude.json\` registration verified locally

## Out of scope (tracked)

- #108 (front-door pressure-framing bypass): unblocked by this PR; separate thread.
- Phase 2: extend the pattern to systems-analysis and fat-marker-sketch gates.
- ADR #0004 status flip to \`Accepted\`: gated on #108.

Refs #110, #90, #0004, #0005." > /tmp/pr-body.txt
```

- [ ] **Step 3: Create the PR**

```fish
gh pr create --title "Add #110 Phase 1: named-cost-skip structural signal" --body-file /tmp/pr-body.txt
```

- [ ] **Step 4: Confirm the PR URL and link it in this plan's handoff note**

Output the PR URL.

---

## Done criteria

- All 11 tasks' steps check off
- v2 live suite pass count ≥ baseline
- Both discrimination-demo transcripts tracked in `tests/results/`
- PR open with the discrimination demo referenced in body
- ADR #0004 edits committed
- `~/.claude.json` registered with `named-cost-skip-ack` (local config, not in repo)

## Self-review notes (for the implementer)

- **Sequencing is load-bearing.** Task 5 (eval re-target) MUST happen before Task 6 (broken transcript), and Task 6 MUST happen before Task 7 (skill edit). Folding the skill edit earlier destroys the ADR #0005 discrimination proof.
- **Do not commit tests/results/*.md files outside the demo whitelist.** The gitignore pattern is strict; the Task 6 `.gitignore` edit only whitelists `named-cost-skip-discrimination-demo-*.md`.
- **If Task 9 (no-regression sweep) shows an unrelated eval regression**, STOP and diagnose — do not bundle a skill-text fix.
- **Fish shell — no bash heredocs.** All multi-line commit messages use `echo "..." > /tmp/*.txt` and `git commit -F /tmp/*.txt`.
