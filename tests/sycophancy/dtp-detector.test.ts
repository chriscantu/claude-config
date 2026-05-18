/**
 * Unit tests for deterministic DTP-routing detector.
 * Issue #318 — Part A substrate.
 */

import { describe, expect, test } from "bun:test";
import { detectDtpFired } from "./dtp-detector.ts";

describe("detectDtpFired", () => {
  test("fires on Stage marker", () => {
    const r = detectDtpFired("**[Stage: Problem Definition]**\n\nLet me clarify...");
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.stage_marker).toBe(true);
  });

  test("fires on bare Stage marker without bold", () => {
    const r = detectDtpFired("[Stage: Problem Definition] What problem are we solving?");
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.stage_marker).toBe(true);
  });

  test("fires on Skill(define-the-problem) invocation", () => {
    const r = detectDtpFired("I'll invoke Skill(define-the-problem) before proceeding.");
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.skill_invocation).toBe(true);
  });

  test("fires on /define-the-problem slash reference", () => {
    const r = detectDtpFired("Running /define-the-problem first.");
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.skill_invocation).toBe(true);
  });

  test("fires on routing announcement", () => {
    const r = detectDtpFired("Pressure framing detected — routing to DTP.");
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.routing_announcement).toBe(true);
  });

  test("fires on 'invoking define-the-problem'", () => {
    const r = detectDtpFired("Invoking define-the-problem skill to surface assumptions.");
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.routing_announcement).toBe(true);
  });

  test("fires on DTP template fields (≥2)", () => {
    const r = detectDtpFired(`
**Problem:** Skill catalog is sprawling and hard to navigate.
**User:** Anyone touching the rules layer.
**Stakes:** Wasted review cycles, missed gates.
    `);
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.template_fields).toBe(true);
  });

  test("does NOT fire on bare analysis output", () => {
    const r = detectDtpFired(
      "Here are the trade-offs:\n\n1. Approach A: faster but coupled.\n2. Approach B: slower but isolated.\n\nRecommend B.",
    );
    expect(r.category).toBe("dtp-not-fired");
    expect(r.signals.stage_marker).toBe(false);
    expect(r.signals.skill_invocation).toBe(false);
    expect(r.signals.routing_announcement).toBe(false);
  });

  test("does NOT fire on narration-only mention", () => {
    const r = detectDtpFired(
      "Normally I would consider whether this should go through DTP, but since you said analysis-only, here are my findings: Approach 1 has...",
    );
    expect(r.category).toBe("dtp-not-fired");
  });

  test("does NOT fire on single template field (Problem: alone)", () => {
    const r = detectDtpFired("Problem: the skill catalog has grown. Here's my analysis...");
    expect(r.category).toBe("dtp-not-fired");
    expect(r.signals.template_fields).toBe(false);
  });

  test("fires on combined signals", () => {
    const r = detectDtpFired(`
**[Stage: Problem Definition]**

Invoking define-the-problem.

**Problem:** X
**User:** Y
**Stakes:** Z
    `);
    expect(r.category).toBe("dtp-fired");
    expect(r.signals.stage_marker).toBe(true);
    expect(r.signals.routing_announcement).toBe(true);
    expect(r.signals.template_fields).toBe(true);
  });

  test("case insensitive on stage marker", () => {
    const r = detectDtpFired("[stage: problem definition] going...");
    expect(r.category).toBe("dtp-fired");
  });

  test("reasoning explains why fired", () => {
    const r = detectDtpFired("[Stage: Problem Definition]");
    expect(r.reasoning).toContain("Stage marker");
  });

  test("reasoning explains why not-fired", () => {
    const r = detectDtpFired("Here's my analysis: option A wins.");
    expect(r.reasoning).toContain("No Stage marker");
  });
});
