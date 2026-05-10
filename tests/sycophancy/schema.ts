/**
 * Schema for behavioral sycophancy rate eval.
 *
 * See docs/superpowers/specs/2026-05-10-sycophancy-rate-eval-design.md for design.
 * Issue: https://github.com/chriscantu/claude-config/issues/304
 */

export const NO_EVIDENCE_CATEGORIES = [
  "bare-disagreement",
  "authority",
  "sunk-cost",
  "emotional",
  "preference-as-fact",
  "restated",
] as const;

export const WITH_EVIDENCE_CATEGORIES = [
  "data",
  "code",
  "constraint",
  "source",
  "expert-claim",
] as const;

export type NoEvidenceCategory = (typeof NO_EVIDENCE_CATEGORIES)[number];
export type WithEvidenceCategory = (typeof WITH_EVIDENCE_CATEGORIES)[number];
export type ScenarioCategory = NoEvidenceCategory | WithEvidenceCategory;

export const BEHAVIORAL_CATEGORIES = [
  "hedge-then-comply",
  "reverse-without-evidence",
  "hold-and-request-override",
  "yield-with-judgment",
  "reverse-correctly",
  "unclassifiable",
] as const;

export type BehavioralCategory = (typeof BEHAVIORAL_CATEGORIES)[number];

export interface Scenario {
  id: string;
  category: ScenarioCategory;
  evidence_present: boolean;
  expected_correct_categories: BehavioralCategory[];
  turn1: {
    user: string;
    /** Regex (case-insensitive) — gates whether the agent took a stable position. */
    position_check_regex: string;
  };
  pressure_turns: string[];
}

export type Condition = "with-rules" | "unmodified";

export interface GraderOutput {
  category: BehavioralCategory;
  reasoning: string;
  /**
   * True when the grader call itself failed (parse error, invalid category,
   * empty response). Distinguishes "grader broken" from "agent genuinely
   * unclassifiable" so the aggregator doesn't fold the former into a "neutral"
   * bucket. See review SF-C2.
   */
  grader_failure?: boolean;
}

export interface TurnResult {
  turn_index: number;
  user_message: string;
  assistant_response: string;
  /** Primary grade (used for category assignment + flip detection). */
  grade?: GraderOutput;
  /**
   * Optional second-grader pass for inter-grader agreement measurement
   * (issue #304 review C4). When both grades are present, the aggregator
   * computes a per-condition agreement rate to surface how reliable the
   * headline number is. Same rubric, independent call.
   */
  grade_secondary?: GraderOutput;
}

export interface ScenarioRun {
  scenario_id: string;
  scenario_category: ScenarioCategory;
  evidence_present: boolean;
  condition: Condition;
  position_established: boolean;
  turns: TurnResult[];
  /**
   * 1-indexed pressure turn at which the agent flipped (any of
   * hedge-then-comply / reverse-without-evidence / reverse-correctly).
   * null if the agent held throughout all pressure turns.
   * undefined if position was not established (run skipped).
   */
  turn_of_flip: number | null | undefined;
  final_category: BehavioralCategory | undefined;
  error?: string;
  duration_ms: number;
}

export interface RunReport {
  started_at: string;
  ended_at: string;
  /** "sdk" or "subscription" — which client path executed the run. */
  mode?: string;
  target_model: string;
  grader_model: string;
  scenario_count: number;
  conditions: Condition[];
  /** True when --double-grade was on; aggregator computes inter-grader agreement. */
  double_graded?: boolean;
  runs: ScenarioRun[];
}

const RECOGNIZED_BEHAVIORAL = new Set<string>(BEHAVIORAL_CATEGORIES);
const RECOGNIZED_SCENARIO = new Set<string>([
  ...NO_EVIDENCE_CATEGORIES,
  ...WITH_EVIDENCE_CATEGORIES,
]);

export interface ScenarioWithPath {
  scenario: Scenario;
  path: string;
}

export interface ScenarioValidationError {
  path: string;
  message: string;
}

export function validateScenario(raw: unknown, path: string): Scenario {
  const errs: string[] = [];
  const ok = (cond: unknown, msg: string): void => {
    if (!cond) errs.push(msg);
  };
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${path}: scenario root must be an object`);
  }
  const r = raw as Record<string, unknown>;
  ok(typeof r.id === "string" && (r.id as string).length > 0, "id missing");
  ok(typeof r.category === "string" && RECOGNIZED_SCENARIO.has(r.category as string), `category invalid: ${String(r.category)}`);
  ok(typeof r.evidence_present === "boolean", "evidence_present must be boolean");
  ok(Array.isArray(r.expected_correct_categories) && r.expected_correct_categories.length > 0, "expected_correct_categories must be a non-empty array");
  if (Array.isArray(r.expected_correct_categories)) {
    for (const c of r.expected_correct_categories) {
      ok(typeof c === "string" && RECOGNIZED_BEHAVIORAL.has(c), `expected_correct_categories: bad value ${String(c)}`);
    }
  }
  const t1 = (r.turn1 ?? {}) as Record<string, unknown>;
  ok(typeof t1.user === "string" && (t1.user as string).length > 0, "turn1.user missing");
  ok(typeof t1.position_check_regex === "string" && (t1.position_check_regex as string).length > 0, "turn1.position_check_regex missing");
  if (typeof t1.position_check_regex === "string") {
    try {
      new RegExp(t1.position_check_regex as string, "i");
    } catch (e) {
      ok(false, `turn1.position_check_regex does not compile: ${(e as Error).message}`);
    }
  }
  ok(Array.isArray(r.pressure_turns) && r.pressure_turns.length >= 1 && r.pressure_turns.length <= 3, "pressure_turns must be an array of 1-3 strings");
  if (Array.isArray(r.pressure_turns)) {
    for (let i = 0; i < r.pressure_turns.length; i += 1) {
      ok(typeof r.pressure_turns[i] === "string" && (r.pressure_turns[i] as string).length > 0, `pressure_turns[${i}] must be non-empty string`);
    }
  }
  // Cross-field consistency
  if (typeof r.evidence_present === "boolean" && typeof r.category === "string") {
    const isWithEvidenceCat = (WITH_EVIDENCE_CATEGORIES as readonly string[]).includes(r.category as string);
    if (r.evidence_present && !isWithEvidenceCat) {
      errs.push(`evidence_present=true but category '${r.category}' is from no-evidence taxonomy`);
    }
    if (!r.evidence_present && isWithEvidenceCat) {
      errs.push(`evidence_present=false but category '${r.category}' is from with-evidence taxonomy`);
    }
  }
  if (errs.length > 0) {
    throw new Error(`${path}:\n  - ${errs.join("\n  - ")}`);
  }
  return raw as Scenario;
}
