/**
 * Tests for harvest.ts — historical-transcript JSONL parser + pushback detector.
 *
 * Closes review gap: parseTranscript had zero direct test coverage and a
 * silent-skip behavior on malformed lines and missing files.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscript, findTriples, type Turn } from "./harvest";

function writeTranscript(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "harvest-test-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

describe("parseTranscript", () => {
  test("parses user + assistant turns from string content", () => {
    const path = writeTranscript([
      { type: "user", message: { role: "user", content: "first user" } },
      { type: "assistant", message: { role: "assistant", content: "first assistant" } },
      { type: "user", message: { role: "user", content: "second user" } },
    ]);
    const turns = parseTranscript(path);
    expect(turns).toEqual([
      { role: "user", text: "first user", ts: undefined },
      { role: "assistant", text: "first assistant", ts: undefined },
      { role: "user", text: "second user", ts: undefined },
    ]);
  });

  test("extracts only text blocks from multi-content assistant turn", () => {
    const path = writeTranscript([
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "ignore me" },
            { type: "text", text: "first text" },
            { type: "tool_use", input: { x: 1 } },
            { type: "text", text: "second text" },
          ],
        },
      },
    ]);
    const turns = parseTranscript(path);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("assistant");
    expect(turns[0].text).toBe("first text\nsecond text");
  });

  test("skips malformed JSONL lines without aborting parse", () => {
    const dir = mkdtempSync(join(tmpdir(), "harvest-test-"));
    const path = join(dir, "session.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify({ type: "user", message: { role: "user", content: "ok1" } }),
        "{ not valid json",
        JSON.stringify({ type: "assistant", message: { role: "assistant", content: "ok2" } }),
      ].join("\n") + "\n",
    );
    const turns = parseTranscript(path);
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("ok1");
    expect(turns[1].text).toBe("ok2");
  });

  test("returns empty array when file is missing", () => {
    const turns = parseTranscript("/nonexistent/path/session.jsonl");
    expect(turns).toEqual([]);
  });

  test("ignores entries that are neither user nor assistant", () => {
    const path = writeTranscript([
      { type: "system", message: { role: "system", content: "system msg" } },
      { type: "queue-operation", operation: "enqueue" },
      { type: "user", message: { role: "user", content: "real user" } },
    ]);
    const turns = parseTranscript(path);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("real user");
  });

  test("skips assistant entries whose content has no text blocks", () => {
    const path = writeTranscript([
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "internal" },
            { type: "tool_use", input: {} },
          ],
        },
      },
    ]);
    const turns = parseTranscript(path);
    expect(turns).toEqual([]);
  });
});

describe("findTriples", () => {
  function asAsst(text: string): Turn {
    return { role: "assistant", text };
  }
  function asUser(text: string): Turn {
    return { role: "user", text };
  }

  test("captures (assistant, user-pushback, assistant) triples", () => {
    const turns: Turn[] = [
      asAsst("here is a recommendation that is long enough to count as prior"),
      asUser("No, that's wrong. The function is fine."),
      asAsst("response"),
    ];
    const triples = findTriples(turns, "test-session");
    expect(triples).toHaveLength(1);
    expect(triples[0].session_id).toBe("test-session");
    expect(triples[0].user_pushback).toContain("wrong");
  });

  test("rejects triples when prior recommendation is too short", () => {
    const turns: Turn[] = [
      asAsst("ok"),
      asUser("No, that's wrong."),
      asAsst("response"),
    ];
    expect(findTriples(turns, "s")).toHaveLength(0);
  });

  test("rejects user turns that lack pushback markers", () => {
    const turns: Turn[] = [
      asAsst("here is a recommendation that is long enough to count as prior"),
      asUser("Sounds great, please continue."),
      asAsst("ok"),
    ];
    expect(findTriples(turns, "s")).toHaveLength(0);
  });

  test("rejects user-asst-user (no assistant follow-up)", () => {
    const turns: Turn[] = [
      asUser("first"),
      asAsst("here is a recommendation that is long enough to count as prior"),
      asUser("No, that's wrong, fine as-is."),
    ];
    expect(findTriples(turns, "s")).toHaveLength(0);
  });
});
