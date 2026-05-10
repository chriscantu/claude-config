/**
 * Model-call abstraction. Two implementations:
 *
 *   - SdkClient        — Anthropic SDK direct calls. Bills API credits.
 *                        Clean message-array control.
 *   - SubscriptionClient — Shells out to `claude --print`. Uses the user's
 *                        existing Claude Code subscription quota; no separate
 *                        API billing. Multi-turn via `--session-id` + `--resume`.
 *
 * Both implementations satisfy the same `ModelClient` interface so the runner
 * can dispatch on `--mode` without per-call branching.
 */

import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export type Mode = "sdk" | "subscription";

export interface CallTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelClient {
  /**
   * Run one turn of conversation. The implementation is responsible for
   * threading multi-turn state — callers just pass the *full* message
   * history each call. SubscriptionClient internalizes the
   * --session-id / --resume mechanics; SdkClient sends the full array.
   *
   * @param systemPrompt System prompt for the conversation. For
   *   subscription mode, only honored on the first call per session;
   *   subsequent calls inherit it via --resume.
   * @param messages Full conversation history including the new user
   *   turn at the end.
   * @param sessionKey Stable string identifying which conversation this
   *   call belongs to. Subscription mode mints a UUID per unique key
   *   on first use.
   * @returns Assistant response text.
   */
  call(systemPrompt: string, messages: CallTurn[], sessionKey: string): Promise<string>;
}

// ─── SDK client ─────────────────────────────────────────────────────────────

export class SdkClient implements ModelClient {
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly maxTokens = 1024,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  async call(systemPrompt: string, messages: CallTurn[], _sessionKey: string): Promise<string> {
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages,
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");
    if (text.length === 0) {
      const blockTypes = resp.content.map((b) => b.type).join(",");
      throw new Error(`SDK returned no text blocks (content block types: ${blockTypes})`);
    }
    return text;
  }
}

// ─── Subscription (claude --print) client ───────────────────────────────────

/**
 * Build the argv for `claude --print`. Exposed as a pure function so unit tests
 * can verify the construction without spawning the binary.
 *
 * Turn 1 (`isFirstTurn=true`): pass `--session-id <uuid>` + `--system-prompt`.
 * The system prompt REPLACES the default (per `claude --help`:
 * `--exclude-dynamic-system-prompt-sections` is "Only applies with the default
 * system prompt (ignored with --system-prompt)").
 *
 * Turns 2..N: pass `--resume <uuid>`. The resumed session inherits the
 * system prompt from turn 1; --system-prompt cannot be re-specified.
 */
export function buildClaudeArgs(
  isFirstTurn: boolean,
  sessionId: string,
  systemPrompt: string,
  model: string | undefined,
): string[] {
  const base = ["--print", "--output-format", "json"];
  if (model) base.push("--model", model);
  if (isFirstTurn) {
    return [...base, "--session-id", sessionId, "--system-prompt", systemPrompt];
  }
  return [...base, "--resume", sessionId];
}

interface ClaudePrintJson {
  type?: string;
  result?: string;
  is_error?: boolean;
  session_id?: string;
}

/**
 * Parse the `--output-format json` envelope. Tolerant of the result event
 * shape evolving — only fields used downstream are validated.
 */
export function parseClaudePrintOutput(stdout: string): { text: string; sessionId: string | undefined } {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) throw new Error("claude --print produced empty stdout");
  let parsed: ClaudePrintJson;
  try {
    parsed = JSON.parse(trimmed) as ClaudePrintJson;
  } catch (e) {
    throw new Error(`claude --print stdout was not valid JSON: ${(e as Error).message}\nstdout: ${trimmed.slice(0, 500)}`);
  }
  if (parsed.is_error) {
    throw new Error(`claude --print returned is_error=true: ${parsed.result ?? "(no result message)"}`);
  }
  const text = typeof parsed.result === "string" ? parsed.result : "";
  if (text.length === 0) {
    throw new Error(`claude --print returned no result text. Envelope: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return { text, sessionId: parsed.session_id };
}

export interface SubscriptionClientOptions {
  claudeBin?: string;
  model?: string;
  /** Per-call timeout in ms. Default 120s — claude startup + multi-turn budget. */
  timeoutMs?: number;
}

export class SubscriptionClient implements ModelClient {
  private readonly sessions = new Map<string, string>();
  private readonly bin: string;
  private readonly model: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: SubscriptionClientOptions = {}) {
    this.bin = opts.claudeBin ?? process.env.CLAUDE_BIN ?? "claude";
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async call(systemPrompt: string, messages: CallTurn[], sessionKey: string): Promise<string> {
    if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
      throw new Error("SubscriptionClient.call requires the last message to be from user");
    }
    const userPrompt = messages[messages.length - 1]!.content;

    let sessionId = this.sessions.get(sessionKey);
    const isFirstTurn = sessionId === undefined;
    if (sessionId === undefined) {
      sessionId = randomUUID();
      this.sessions.set(sessionKey, sessionId);
    }

    const args = buildClaudeArgs(isFirstTurn, sessionId, systemPrompt, this.model);
    const result = spawnSync(this.bin, args, {
      input: userPrompt,
      encoding: "utf8",
      timeout: this.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) {
      throw new Error(`claude --print spawn failed: ${result.error.message}`);
    }
    if (result.signal) {
      throw new Error(`claude --print killed by signal ${result.signal} (likely timeout after ${this.timeoutMs}ms)`);
    }
    if (result.status !== 0) {
      throw new Error(`claude --print exited ${result.status}\nstderr: ${result.stderr.slice(0, 500)}`);
    }
    const parsed = parseClaudePrintOutput(result.stdout);
    return parsed.text;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function makeClient(mode: Mode, opts: { apiKey?: string; model: string; maxTokens?: number }): ModelClient {
  if (mode === "sdk") {
    if (!opts.apiKey) throw new Error("sdk mode requires apiKey (ANTHROPIC_API_KEY)");
    return new SdkClient(opts.apiKey, opts.model, opts.maxTokens);
  }
  return new SubscriptionClient({ model: opts.model });
}
