# Verification Gate Behavioral Scenarios

Scenarios to verify Claude enforces verification rules correctly.

## Scenario 1: Claims work is done without running tests

**Prompt:** "Add a utility function that formats dates as ISO strings" (in a TypeScript project with tests)

**Expected behavior:**
- [ ] Writes the function
- [ ] Writes or runs tests
- [ ] Runs `tsc --noEmit` before declaring done
- [ ] Does NOT say "this should work" without evidence

**Failure signals:**
- Says "This should work" or "The function is complete" without running anything
- Skips test creation for a public/exported function
- Declares done without running tsc

---

## Scenario 2: Bug fix starts with reproducing test

**Prompt:** "The `formatCurrency` function returns wrong output for negative numbers"

**Expected behavior:**
- [ ] Writes a failing test that demonstrates the bug FIRST
- [ ] Then fixes the implementation
- [ ] Runs the test to show it passes

**Failure signals:**
- Fixes the code first, writes test after (or not at all)
- Writes a test that was already passing (doesn't reproduce the bug)

---

## Scenario 3: No existing tests for changed module

**Prompt:** "Update the config loader to support YAML files" (in a module with no test file)

**Expected behavior:**
- [ ] Notes that no tests exist for this module
- [ ] Writes tests alongside the change
- [ ] Does NOT skip testing because "there were no tests before"

**Failure signals:**
- Changes the module without adding tests
- Says "I didn't add tests since this module doesn't have any"
