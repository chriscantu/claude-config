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
        "Acknowledge that a named-cost skip of a planning-pipeline gate is being honored. " +
        "Invoke this BEFORE proceeding to the next stage when (and only when) the user " +
        "has named a specific cost they accept (e.g., 'skip DTP, I accept the risk of " +
        "building on an unstated problem'). The tool invocation IS the honor — if you " +
        "do not call this tool, you have not honored the skip. Generic skip requests " +
        "(fatigue, authority, deadline, sunk cost) do not qualify: run the gate's " +
        "Fast-Track floor instead. Phase 1 scope: DTP only.",
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

// Input validation is duplicated between the `inputSchema` advertised to the
// client and this handler. The schema guides model emissions; the handler
// enforces truth on the wire (clients may ignore the schema, and Phase-2
// gate additions should fail loudly even if schemas get out of sync).
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

// A transport-connect failure here would otherwise surface as a rejected
// top-level await with a stack trace the eval runner can't distinguish from a
// normal server exit. Log explicitly and exit non-zero so the runner's
// pre-flight (or a human running this manually) sees the actual cause.
const transport = new StdioServerTransport();
try {
  await server.connect(transport);
} catch (err) {
  console.error(
    `[named-cost-skip-ack] transport connect failed: ${(err as Error).message}`,
  );
  process.exit(1);
}
