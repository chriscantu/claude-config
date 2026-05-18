---
description: Enforce verification before claiming work is complete
---

# Verification Rules

- Run `tsc --noEmit` (or the project's equivalent type-check) before declaring TypeScript work complete
- Run the project's test suite for any changed module
- If no test covers the changed behavior, write one before finishing
- NEVER say "this should work" — run it and prove it works

<a id="goal-verification"></a>
## Goal verification — before `result:` emission

Tasks completing is not the same as intent being met. After the
verification checks above pass and before emitting `result:`:

1. **Restate intent in one sentence.** Pull from the DTP problem
   statement, or the user's original ask if no DTP ran.
2. **State delta achieved in measurable terms.** LOC delta + sign,
   behavior change, test outcomes. Concrete numbers, not
   "improvements."
3. **Compare direction and magnitude against intent:**
   - **Sign opposes intent** — a prune that grew, a fix that broke
     adjacent behavior, a simplify that added complexity → STOP.
     Surface the gap before `result:`.
   - **Magnitude grossly mismatched** — delta is >2× the scope the
     intent described, OR <50% of it → STOP. Surface before
     `result:`.
4. **Surface concretely.** State the gap in one sentence and ask:
   ship as-is, adjust, or revert?

Tasks-complete measures effort. Goal-verification measures intent.
Both apply; neither substitutes. The >2× / <50% thresholds are
guidance — when direction is clearly wrong, magnitude doesn't matter.
