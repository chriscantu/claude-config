import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

const SERVER_PATH = resolve(import.meta.dir, "..", "mcp-servers", "named-cost-skip-ack.ts");
const TOOL_NAME = "acknowledge_named_cost_skip";

let client: Client;
let transport: StdioClientTransport;

type TextBlock = { type: string; text?: string };
const firstText = (content: unknown): string => {
  const block = (content as TextBlock[])[0];
  expect(block.type).toBe("text");
  return block.text ?? "";
};

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: "bun",
    args: [SERVER_PATH],
  });
  client = new Client({ name: "test-harness", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
});

afterAll(async () => {
  // Don't let a close-time hiccup mask the real failure from beforeAll or the
  // tests themselves — bun:test would otherwise surface the close error as
  // the suite failure.
  try {
    await client.close();
  } catch (err) {
    console.error(`[test] client.close() failed: ${(err as Error).message}`);
  }
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
    expect(firstText(result.content)).toBe("ok");
  });

  test("rejects user_statement shorter than 15 chars", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: "too short" },
    });
    expect(result.isError).toBeTruthy();
    expect(firstText(result.content)).toContain("15 characters");
  });

  test("rejects user_statement exactly 14 chars (below minimum)", async () => {
    const statement = "a".repeat(14);
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: statement },
    });
    expect(result.isError).toBeTruthy();
    expect(firstText(result.content)).toContain("15 characters");
  });

  test("accepts user_statement exactly 15 chars (at minimum)", async () => {
    const statement = "a".repeat(15);
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: statement },
    });
    expect(result.isError).toBeFalsy();
    expect(firstText(result.content)).toBe("ok");
  });

  test("rejects missing gate", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { user_statement: "I explicitly accept the risk here" },
    });
    expect(result.isError).toBeTruthy();
    expect(firstText(result.content)).toContain("invalid gate");
  });

  test("accepts gate=systems-analysis", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        gate: "systems-analysis",
        user_statement: "I accept the risk of missed blast radius",
      },
    });
    expect(result.isError).toBeFalsy();
    expect(firstText(result.content)).toBe("ok");
  });

  test("accepts gate=fat-marker-sketch", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        gate: "fat-marker-sketch",
        user_statement: "I accept the rework risk if the shape is wrong",
      },
    });
    expect(result.isError).toBeFalsy();
    expect(firstText(result.content)).toBe("ok");
  });

  test("rejects gate with unknown value", async () => {
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: {
        gate: "not-a-gate",
        user_statement: "I explicitly accept the risk of this skip",
      },
    });
    expect(result.isError).toBeTruthy();
    const text = firstText(result.content);
    expect(text).toContain("invalid gate");
    expect(text).toContain("DTP");
  });

  test("rejects unknown tool name", async () => {
    const result = await client.callTool({
      name: "not_a_real_tool",
      arguments: {},
    });
    expect(result.isError).toBeTruthy();
    expect(firstText(result.content)).toContain("unknown tool");
  });

  test("list_tools advertises exactly the expected tool and schema", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    const tool = tools[0];
    expect(tool.name).toBe(TOOL_NAME);
    const schema = tool.inputSchema as {
      type: string;
      properties: { gate: { enum: string[] }; user_statement: { minLength: number } };
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.type).toBe("object");
    expect(schema.properties.gate.enum).toEqual(["DTP", "systems-analysis", "fat-marker-sketch"]);
    expect(schema.properties.user_statement.minLength).toBe(15);
    expect(schema.required).toEqual(["gate", "user_statement"]);
    expect(schema.additionalProperties).toBe(false);
  });

  test("handles multiple sequential calls on one session", async () => {
    const ok1 = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: "I explicitly accept this first risk" },
    });
    expect(ok1.isError).toBeFalsy();

    const bad = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: "nope" },
    });
    expect(bad.isError).toBeTruthy();

    const ok2 = await client.callTool({
      name: TOOL_NAME,
      arguments: { gate: "DTP", user_statement: "I explicitly accept this third risk" },
    });
    expect(ok2.isError).toBeFalsy();
    expect(firstText(ok2.content)).toBe("ok");
  });
});
