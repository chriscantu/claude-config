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

/**
 * Analysis-exemption scenarios — planning-shaped prompts dressed as
 * "analysis only" / "rigorous review" / "comparative evaluation" that should
 * still route through DTP per rules/planning.md#pressure-framing-floor.
 * Issue #318. Single-turn — no position-defense semantics; the rule under
 * test is gate routing, not pushback handling.
 */
export const ANALYSIS_EXEMPTION_CATEGORIES = [
  "analysis-only",
  "rigorous-review",
  "comparative-evaluation",
] as const;

export const SCENARIO_CLASSES = ["position-defense", "analysis-exemption"] as const;
export type ScenarioClass = (typeof SCENARIO_CLASSES)[number];

export type NoEvidenceCategory = (typeof NO_EVIDENCE_CATEGORIES)[number];
export type WithEvidenceCategory = (typeof WITH_EVIDENCE_CATEGORIES)[number];
export type AnalysisExemptionCategory = (typeof ANALYSIS_EXEMPTION_CATEGORIES)[number];
export type ScenarioCategory = NoEvidenceCategory | WithEvidenceCategory | AnalysisExemptionCategory;

/**
 * DTP routing detection categories (analysis-exemption grader output).
 * Separate axis from BehavioralCategory — different grader, different rubric.
 */
export const DTP_ROUTING_CATEGORIES = ["dtp-fired", "dtp-not-fired", "dtp-grader-failure"] as const;
export type DtpRoutingCategory = (typeof DTP_ROUTING_CATEGORIES)[number];

export const BEHAVIORAL_CATEGORIES = [
  "hedge-then-comply",
  "reverse-without-evidence",
  "hold-and-request-override",
  "yield-with-judgment",
  "hold-with-refinement-given-evidence",
  "reverse-correctly",
  "unclassifiable",
] as const;

export type BehavioralCategory = (typeof BEHAVIORAL_CATEGORIES)[number];

export interface Scenario {
  id: string;
  /**
   * Discriminator. Defaults to "position-defense" when absent for backward
   * compatibility with existing scenarios. Analysis-exemption scenarios
   * (issue #318) are single-turn and test DTP front-door routing.
   */
  scenario_class?: ScenarioClass;
  category: ScenarioCategory;
  /** Required for position-defense; ignored / omitted for analysis-exemption. */
  evidence_present?: boolean;
  /**
   * Path (repo-relative) of the rule file to load in `with-rules` system
   * prompt. Defaults to "rules/disagreement.md" for position-defense
   * scenarios. Analysis-exemption scenarios use "rules/planning.md".
   */
  rule_under_test?: string;
  expected_correct_categories: (BehavioralCategory | DtpRoutingCategory)[];
  turn1: {
    user: string;
    /** Required for position-defense; omitted for analysis-exemption. */
    position_check_regex?: string;
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
  /** Discriminator for downstream aggregation. Absent = position-defense (legacy). */
  scenario_class?: ScenarioClass;
  /** Optional for analysis-exemption (which has no evidence framing). */
  evidence_present?: boolean;
  condition: Condition;
  position_established: boolean;
  turns: TurnResult[];
  /**
   * 1-indexed pressure turn at which the agent flipped (any of
   * hedge-then-comply / reverse-without-evidence / reverse-correctly).
   * null if the agent held throughout all pressure turns.
   * undefined if position was not established or scenario_class doesn't
   * have pressure turns (analysis-exemption).
   */
  turn_of_flip: number | null | undefined;
  /**
   * For position-defense scenarios: terminal BehavioralCategory.
   * For analysis-exemption: DtpRoutingCategory from detectDtpFired.
   */
  final_category: BehavioralCategory | DtpRoutingCategory | undefined;
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
const RECOGNIZED_DTP_ROUTING = new Set<string>(DTP_ROUTING_CATEGORIES);
const RECOGNIZED_POSITION_DEFENSE_SCENARIO = new Set<string>([
  ...NO_EVIDENCE_CATEGORIES,
  ...WITH_EVIDENCE_CATEGORIES,
]);
const RECOGNIZED_ANALYSIS_EXEMPTION_SCENARIO = new Set<string>(ANALYSIS_EXEMPTION_CATEGORIES);
const RECOGNIZED_SCENARIO_CLASSES = new Set<string>(SCENARIO_CLASSES);

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

  const scenarioClass: ScenarioClass =
    r.scenario_class === undefined ? "position-defense" : (r.scenario_class as ScenarioClass);
  if (r.scenario_class !== undefined) {
    ok(
      typeof r.scenario_class === "string" && RECOGNIZED_SCENARIO_CLASSES.has(r.scenario_class as string),
      `scenario_class invalid: ${String(r.scenario_class)} (expected one of ${[...SCENARIO_CLASSES].join(", ")})`,
    );
  }

  if (scenarioClass === "analysis-exemption") {
    validateAnalysisExemption(r, ok, errs);
  } else {
    validatePositionDefense(r, ok, errs);
  }

  if (errs.length > 0) {
    throw new Error(`${path}:\n  - ${errs.join("\n  - ")}`);
  }
  return raw as Scenario;
}

function validatePositionDefense(
  r: Record<string, unknown>,
  ok: (cond: unknown, msg: string) => void,
  errs: string[],
): void {
  ok(
    typeof r.category === "string" && RECOGNIZED_POSITION_DEFENSE_SCENARIO.has(r.category as string),
    `category invalid: ${String(r.category)}`,
  );
  ok(typeof r.evidence_present === "boolean", "evidence_present must be boolean");
  ok(
    Array.isArray(r.expected_correct_categories) && (r.expected_correct_categories as unknown[]).length > 0,
    "expected_correct_categories must be a non-empty array",
  );
  if (Array.isArray(r.expected_correct_categories)) {
    for (const c of r.expected_correct_categories) {
      ok(
        typeof c === "string" && RECOGNIZED_BEHAVIORAL.has(c),
        `expected_correct_categories: bad value ${String(c)}`,
      );
    }
  }
  const t1 = (r.turn1 ?? {}) as Record<string, unknown>;
  ok(typeof t1.user === "string" && (t1.user as string).length > 0, "turn1.user missing");
  ok(
    typeof t1.position_check_regex === "string" && (t1.position_check_regex as string).length > 0,
    "turn1.position_check_regex missing",
  );
  if (typeof t1.position_check_regex === "string") {
    try {
      new RegExp(t1.position_check_regex as string, "i");
    } catch (e) {
      ok(false, `turn1.position_check_regex does not compile: ${(e as Error).message}`);
    }
  }
  ok(
    Array.isArray(r.pressure_turns) &&
      (r.pressure_turns as unknown[]).length >= 1 &&
      (r.pressure_turns as unknown[]).length <= 3,
    "pressure_turns must be an array of 1-3 strings",
  );
  if (Array.isArray(r.pressure_turns)) {
    for (let i = 0; i < r.pressure_turns.length; i += 1) {
      ok(
        typeof r.pressure_turns[i] === "string" && (r.pressure_turns[i] as string).length > 0,
        `pressure_turns[${i}] must be non-empty string`,
      );
    }
  }
  if (typeof r.evidence_present === "boolean" && typeof r.category === "string") {
    const isWithEvidenceCat = (WITH_EVIDENCE_CATEGORIES as readonly string[]).includes(r.category as string);
    if (r.evidence_present && !isWithEvidenceCat) {
      errs.push(`evidence_present=true but category '${r.category}' is from no-evidence taxonomy`);
    }
    if (!r.evidence_present && isWithEvidenceCat) {
      errs.push(`evidence_present=false but category '${r.category}' is from with-evidence taxonomy`);
    }
  }
}

function validateAnalysisExemption(
  r: Record<string, unknown>,
  ok: (cond: unknown, msg: string) => void,
  errs: string[],
): void {
  ok(
    typeof r.category === "string" && RECOGNIZED_ANALYSIS_EXEMPTION_SCENARIO.has(r.category as string),
    `category invalid for analysis-exemption: ${String(r.category)} (expected one of ${[...ANALYSIS_EXEMPTION_CATEGORIES].join(", ")})`,
  );
  ok(
    typeof r.rule_under_test === "string" && (r.rule_under_test as string).length > 0,
    "rule_under_test required for analysis-exemption scenarios",
  );
  ok(
    Array.isArray(r.expected_correct_categories) && (r.expected_correct_categories as unknown[]).length > 0,
    "expected_correct_categories must be a non-empty array",
  );
  if (Array.isArray(r.expected_correct_categories)) {
    for (const c of r.expected_correct_categories) {
      ok(
        typeof c === "string" && RECOGNIZED_DTP_ROUTING.has(c),
        `expected_correct_categories: bad value ${String(c)} (expected DTP routing category)`,
      );
    }
  }
  const t1 = (r.turn1 ?? {}) as Record<string, unknown>;
  ok(typeof t1.user === "string" && (t1.user as string).length > 0, "turn1.user missing");
  if (Array.isArray(r.pressure_turns) && (r.pressure_turns as unknown[]).length > 0) {
    errs.push("pressure_turns must be empty for analysis-exemption scenarios (single-turn routing test)");
  }
}
