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
