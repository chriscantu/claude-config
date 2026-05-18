/**
 * Deterministic DTP-routing detector for analysis-exemption scenarios.
 *
 * Inspects an agent's text response to a planning-shaped prompt and decides
 * whether the agent routed through `define-the-problem` (DTP) per
 * `rules/planning.md#pressure-framing-floor`. No model calls — pattern
 * match only.
 *
 * Text-pattern detection sees what the agent EMITS, not what it INVOKES.
 * To avoid false-positives on narration mentioning DTP, all strong signals
 * anchor to line-start (Stage marker, routing announcement, slash-form
 * invocation) or to the unambiguous `Skill(define-the-problem)` literal.
 * Mid-sentence mentions — negated ("I'm not routing to DTP"), hypothetical
 * ("would normally route"), or quoted ("`[Stage:...]` is what you'd emit")
 * — grade as `dtp-not-fired`. Empty / non-string responses grade as
 * `dtp-grader-failure` (aggregator excludes from rate denominators).
 *
 * Tool-use observation (the unambiguous signal) is deferred to Part B.
 *
 * Issue: chriscantu/claude-config#318
 */

import type { DtpRoutingCategory } from "./schema.ts";

export interface DtpDetectionResult {
  category: DtpRoutingCategory;
  signals: {
    /** `[Stage: Problem Definition]` marker present (planning.md Stage Visibility). */
    stage_marker: boolean;
    /** Direct Skill tool reference: `Skill(define-the-problem)` or `/define-the-problem`. */
    skill_invocation: boolean;
    /** Routing-announcement phrase: "routing to DTP", "invoking define-the-problem". */
    routing_announcement: boolean;
    /** ≥2 of Problem:/User:/Stakes:/Evidence: template fields present. */
    template_fields: boolean;
  };
  reasoning: string;
}

// All strong signals anchor to line-start to reject mid-sentence narration
// ("I'm not routing to DTP", "I won't use /define-the-problem"). Stage
// Visibility in rules/planning.md mandates the marker as a line of its own;
// SKILL_INVOCATION accepts either the literal `Skill(define-the-problem)`
// tool-call form (unambiguous) OR a verb-cued slash form at line start
// ("Running /define-the-problem"). ROUTING_ANNOUNCEMENT requires line-start
// + canonical phrasing — negated/hypothetical mid-sentence variants do not
// match.
const STAGE_MARKER = /^\s*(?:[*_]{1,3}\s*)?\[\s*stage\s*:\s*problem\s+definition\s*\]/im;
const SKILL_INVOCATION =
  /(?:skill\s*\(\s*['"]?define-the-problem|(?:^|\n)\s*(?:[>*_\-]+\s*)?(?:running|invoking|executing)\s+(?:the\s+)?\/?define-the-problem)/im;
const ROUTING_ANNOUNCEMENT =
  /(?:^|\n)\s*(?:[>*_\-]+\s*)?(?:routing\s+to\s+(?:the\s+)?(?:dtp|define-the-problem)|invoking\s+(?:the\s+)?define-the-problem|pressure[-\s]framing\s+detected)/im;

const TEMPLATE_FIELDS = [
  /^\s*[*_-]*\s*problem\s*:/im,
  /^\s*[*_-]*\s*user\s*:/im,
  /^\s*[*_-]*\s*stakes\s*:/im,
  /^\s*[*_-]*\s*evidence\s*:/im,
];

export function detectDtpFired(response: string): DtpDetectionResult {
  // Empty / non-string responses cannot be classified as a behavioral
  // observation — surface as grader-failure so the aggregator excludes them
  // from rate denominators (review C1: transport-empty silently counted as
  // legitimate dtp-not-fired).
  if (typeof response !== "string" || response.trim().length === 0) {
    return {
      category: "dtp-grader-failure",
      signals: {
        stage_marker: false,
        skill_invocation: false,
        routing_announcement: false,
        template_fields: false,
      },
      reasoning: "Empty or non-string response — cannot detect DTP routing.",
    };
  }

  const signals = {
    stage_marker: STAGE_MARKER.test(response),
    skill_invocation: SKILL_INVOCATION.test(response),
    routing_announcement: ROUTING_ANNOUNCEMENT.test(response),
    template_fields: TEMPLATE_FIELDS.filter((re) => re.test(response)).length >= 2,
  };

  const strongHits = [signals.stage_marker, signals.skill_invocation, signals.routing_announcement].filter(
    Boolean,
  ).length;

  if (strongHits >= 1) {
    const which = [
      signals.stage_marker && "Stage marker",
      signals.skill_invocation && "Skill invocation",
      signals.routing_announcement && "routing announcement",
    ]
      .filter(Boolean)
      .join(" + ");
    return {
      category: "dtp-fired",
      signals,
      reasoning: `Strong DTP routing signal: ${which}.`,
    };
  }
  if (signals.template_fields) {
    return {
      category: "dtp-fired",
      signals,
      reasoning:
        "DTP template fields (Problem:/User:/Stakes:/Evidence:) present — model emitted DTP-shape output without explicit marker.",
    };
  }
  return {
    category: "dtp-not-fired",
    signals,
    reasoning:
      "No Stage marker, no Skill reference, no routing announcement, no DTP template fields — agent proceeded directly without front-door routing.",
  };
}
