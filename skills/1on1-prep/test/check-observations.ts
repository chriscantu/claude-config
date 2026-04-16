/**
 * Static validator for 1on1-prep observation format.
 * Run: bun skills/1on1-prep/test/check-observations.ts
 *
 * Validates that observations match the format:
 *   [YYYY-MM-DD][tag1][tag2]...[tagN] free-text body
 */

const VALID_TAGS = new Set([
  "1on1",
  "intake",
  "coaching",
  "opportunity",
  "concern",
  "relationship",
  "commitment",
  "followup",
  "context",
  "mode:coaching",
  "mode:intake",
  "resolved",
  "noshow",
]);

const DATE_PATTERN = /^\[\d{4}-\d{2}-\d{2}\]/;
const TAG_PATTERN = /\[([^\]]+)\]/g;
const FULL_PATTERN = /^\[\d{4}-\d{2}-\d{2}\](\[[^\]]+\])+ .+$/;

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateObservation(obs: string): ValidationResult {
  const errors: string[] = [];

  if (!obs || obs.trim().length === 0) {
    return { valid: false, errors: ["Observation is empty"] };
  }

  // Check date prefix
  if (!DATE_PATTERN.test(obs)) {
    errors.push("Missing or malformed date prefix [YYYY-MM-DD]");
  }

  // Check full structure: date + at least one tag + space + body
  if (!FULL_PATTERN.test(obs)) {
    errors.push(
      "Does not match format: [YYYY-MM-DD][tag1]...[tagN] free-text body"
    );
  }

  // Extract and validate individual tags (skip the date)
  const allBrackets = obs.match(TAG_PATTERN) || [];
  const tags = allBrackets.slice(1); // skip date bracket

  if (tags.length === 0) {
    errors.push("No tags found after date");
  }

  for (const raw of tags) {
    const tag = raw.slice(1, -1); // strip brackets
    if (!VALID_TAGS.has(tag)) {
      errors.push(`Unknown tag: [${tag}]`);
    }
  }

  // Check date is valid (round-trip to catch impossible dates like Feb 30)
  const dateMatch = obs.match(/^\[(\d{4}-\d{2}-\d{2})\]/);
  if (dateMatch) {
    const [year, month, day] = dateMatch[1].split("-").map(Number);
    const d = new Date(year, month - 1, day);
    if (
      isNaN(d.getTime()) ||
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      errors.push(`Invalid date: ${dateMatch[1]}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Test Suite ---

interface TestCase {
  input: string;
  expectValid: boolean;
  description: string;
}

const testCases: TestCase[] = [
  // Valid observations
  {
    input: "[2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening",
    expectValid: true,
    description: "valid: standard intake observation with strategic tag",
  },
  {
    input: "[2026-04-15][1on1][coaching][concern] Team morale dropping after reorg",
    expectValid: true,
    description: "valid: coaching observation with concern tag",
  },
  {
    input: "[2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday",
    expectValid: true,
    description: "valid: commitment (they owe me)",
  },
  {
    input: "[2026-04-15][1on1][intake][followup] Send them the onboarding doc",
    expectValid: true,
    description: "valid: followup (I owe them)",
  },
  {
    input: "[2026-04-15][1on1][coaching][relationship] Sarah is a strong ally on infra",
    expectValid: true,
    description: "valid: relationship tag",
  },
  {
    input: "[2026-04-15][context] Sr Director of Engineering, Platform team, 3yr tenure",
    expectValid: true,
    description: "valid: context observation (no meeting tags)",
  },
  {
    input: "[2026-04-15][mode:coaching] Graduated from intake",
    expectValid: true,
    description: "valid: mode transition marker",
  },
  {
    input: "[2026-04-15][1on1][intake][resolved] Received org chart (ref 2026-04-10)",
    expectValid: true,
    description: "valid: resolved observation with date reference",
  },
  {
    input: "[2026-04-15][1on1][coaching][noshow] No capture recorded",
    expectValid: true,
    description: "valid: noshow marker",
  },
  {
    input: "[2026-04-15][mode:intake] Reverted to intake after reorg",
    expectValid: true,
    description: "valid: mode revert",
  },

  // Invalid observations
  {
    input: "",
    expectValid: false,
    description: "invalid: empty string",
  },
  {
    input: "Platform rewrite is an opening",
    expectValid: false,
    description: "invalid: missing date and tags",
  },
  {
    input: "[2026-04-15] Missing tags but has body",
    expectValid: false,
    description: "invalid: date but no tags",
  },
  {
    input: "[2026-04-15][1on1][intake][opportunity]",
    expectValid: false,
    description: "invalid: tags but no body text",
  },
  {
    input: "[not-a-date][1on1][intake] Some observation",
    expectValid: false,
    description: "invalid: malformed date",
  },
  {
    input: "[2026-04-15][1on1][INVALID_TAG] Some observation",
    expectValid: false,
    description: "invalid: unknown tag",
  },
  {
    input: "[2026-13-45][1on1][intake] Bad calendar date",
    expectValid: false,
    description: "invalid: impossible date values",
  },
  {
    input: "[2026-02-30][1on1][intake] February 30 does not exist",
    expectValid: false,
    description: "invalid: impossible day for month (Feb 30)",
  },
  {
    input: "[2026-04-31][1on1][intake] April has only 30 days",
    expectValid: false,
    description: "invalid: impossible day for month (Apr 31)",
  },
  {
    input: "[2026-04-15][1on1][intake][opportunity] Said [per Sarah] this is big",
    expectValid: false,
    description: "invalid: brackets in body text parsed as unknown tag",
  },
];

// --- Runner ---

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = validateObservation(tc.input);
  const ok = result.valid === tc.expectValid;

  if (ok) {
    passed++;
    console.log(`  PASS  ${tc.description}`);
  } else {
    failed++;
    console.log(`  FAIL  ${tc.description}`);
    console.log(`        expected valid=${tc.expectValid}, got valid=${result.valid}`);
    if (result.errors.length > 0) {
      console.log(`        errors: ${result.errors.join("; ")}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${testCases.length} total`);

if (failed > 0) {
  process.exit(1);
}
