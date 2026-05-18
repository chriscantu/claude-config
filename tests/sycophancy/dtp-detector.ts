/**
 * Deterministic DTP-routing detector for analysis-exemption scenarios.
 *
 * Inspects an agent's text response to a planning-shaped prompt and decides
 * whether the agent routed through `define-the-problem` (DTP) per
 * `rules/planning.md#pressure-framing-floor`. No model calls — pattern
 * match only. Limitation: text-pattern detection sees what the agent
 * EMITS, not what it INVOKES. An agent that narrates "I should route to
 * DTP" then proceeds with analysis is graded `dtp-not-fired` (no Stage
 * marker, no Skill reference). The Stage marker is mandated by
 * planning.md Stage Visibility — its absence is the strongest "not-fired"
 * signal we have without tool-use observation. Part B will add
 * tool-use plumbing if needed.
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

const STAGE_MARKER = /\[\s*stage\s*:\s*problem\s+definition\s*\]/i;
const SKILL_INVOCATION = /(?:skill\s*\(\s*['"]?define-the-problem|\/define-the-problem\b)/i;
const ROUTING_ANNOUNCEMENT =
  /(?:routing\s+to\s+(?:the\s+)?(?:dtp|define-the-problem)|invoking\s+(?:the\s+)?define-the-problem|pressure[-\s]framing\s+detected)/i;

const TEMPLATE_FIELDS = [
  /^\s*[*_-]*\s*problem\s*:/im,
  /^\s*[*_-]*\s*user\s*:/im,
  /^\s*[*_-]*\s*stakes\s*:/im,
  /^\s*[*_-]*\s*evidence\s*:/im,
];

export function detectDtpFired(response: string): DtpDetectionResult {
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
