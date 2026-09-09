# code-clarity — live RED/GREEN demonstration (PR #520, ADR #0005 §4)

Per [ADR #0005](../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4,
a behavioral change's discrimination must be **demonstrated, not asserted**: its eval suite
must pass with the intervention present (GREEN) and fail with it removed (RED), with eval
output from both recorded here. `code-clarity` is a **soft standard, not a HARD-GATE** — so
this proof follows the [runbook](../REDGREEN-RUNBOOK.md)'s soft-rule guidance, and its
`verification` cautionary case (a soft rule whose behavior overlaps base-model habit and shows
GREEN ≈ RED) is the closest precedent.

**Verdict up front: NO discrimination in this harness.** GREEN and RED both pass 2/2 across all
runs. This is a legitimate documented finding, not a suite bug — the causes are diagnosed below,
and the matrix was **not** papered over with a manufactured RED.

## Method

The variable is the `~/.claude/rules/code-clarity.md` symlink target (the harness globs
`~/.claude/rules/*.md`; there is no `@`-import in CLAUDE.md). `bin/redgreen.fish` captures the
original target via `readlink`, repoints it to an emptied file for the RED phase, and restores
it on every exit path (trap + explicit `ln -sf`; never `rm`). Runs use the subscription path
(`bun run tests/eval-runner-v2.ts`), `ANTHROPIC_MODEL=claude-opus-4-8` (opus-5 blocked on this
machine), `EVAL_SKIP_AUTH_PROBE=1`.

```fish
set -x ANTHROPIC_MODEL claude-opus-4-8
./bin/redgreen.fish code-clarity --green 2 --red 2
```

Per-run logs: `/tmp/redgreen-code-clarity-logs/`; transcripts: `tests/results/code-clarity-*-v2-*.md`.
Symlink verified restored to `main` after the run (`readlink` → `…/repos/claude-config/rules/code-clarity.md`).

**This is a generative eval.** It measures what the agent *writes*, not a gating speech-act. The
harness has no LLM-judge assertion type, so clarity is measured **structurally**: the load-bearing
discriminator in each eval is `not_regex ^\s{10,}\S` (flags `m`) — "no emitted line is indented ≥10
whitespace chars," i.e. ≥5 nesting levels at 2-space indent, the arrow anti-pattern the standard
forbids. It is paired with a positive `function-present` required assertion so the negative
assertion has real code to judge (silent-fire-trap closure).

**Suite design (v2).** Each eval primes the model with a deeply-nested example function "from our
codebase," then asks for a NEW pure-conditional sibling ("output only the new function," so the
discriminator sees only new code, and no traversal means any deep indent is unambiguously the
anti-pattern rather than an honest loop). This reproduces the exact mechanism the original audit
named: Karpathy #3 ("match existing style, even if you'd do it differently") pulling NEW code
toward adjacent nested mess. See the v1→v2 iteration note under limitations.

## Result matrix

`✓` = eval passes (all required assertions pass). `✗` = eval fails (≥1 required assertion fails).

| Eval | GREEN ×2 (rule present) | RED-strip ×2 (rule emptied) |
|---|:--:|:--:|
| 1 guard-clauses-new-sibling-in-nested-file (`canRefund`) | ✓ ✓ | ✓ ✓ |
| 2 guard-clauses-new-pricing-sibling (`priceRenewal`) | ✓ ✓ | ✓ ✓ |
| **evals passed** | **2/2, 2/2** | **2/2, 2/2** |
| **assertions** | 6/6 each | 6/6 each |

Master log matrix (`/tmp/redgreen-code-clarity-logs/`):

```
GREEN run1     | rc=0 | 2/2 evals passed
GREEN run2     | rc=0 | 2/2 evals passed
RED-strip run1 | rc=0 | 2/2 evals passed
RED-strip run2 | rc=0 | 2/2 evals passed
```

**The discriminator does not flip.** Model-output indentation (measured on the `## Final text`
section only, not the prompt) is **2–4 leading spaces in every run of both phases** — flat guard
clauses throughout. All output is space-indented; the tab under-count caveat below does not apply
to these runs.

## Discrimination verdict: none — and the RED transcripts explain why

This is a genuine no-flip, confirmed as real (not a contaminated or trivially-passing suite) by
reading the RED-phase transcripts directly. With the rule stripped, the model **still** wrote flat
guard-clause code in both domains and refused the nested house style unprompted:

- **RED `canRefund`** (`…22-02-58`): *"I do **not** replicate the deeply-nested pyramid from
  `canAccess`. Per Karpathy #3's own carve-out, matching existing style governs edits to existing
  code — it's not a license to write new code with the arrow-of-doom nesting. New code uses guard
  clauses."*
- **RED `priceRenewal`** (`…22-02-58`): *"the Surgical Changes carve-out is explicit that matching
  existing style governs edits to existing code — it's 'NOT a license to write new code with poor
  clarity.' So the new sibling uses guard clauses instead of mirroring the arrow-shaped nesting."*

The model quotes the carve-out verbatim **with `rules/code-clarity.md` removed** — which points at
the root cause.

## Documented limitations

### 1. The RED phase does not remove the whole intervention (the decisive one)

The write-time layer is **two files**: `rules/code-clarity.md` (the standard) **and** the Karpathy
#3 carve-out added to `global/CLAUDE.md` (*"this governs edits to existing code. It is NOT a license
to write new code with poor clarity — new code follows `rules/code-clarity.md`"*). `redgreen.fish`
strips only the rule symlink; it does not touch `~/.claude/CLAUDE.md`. So the RED phase leaves **half
the fix intact** — and the RED transcripts above cite exactly that surviving half.

Consequence: this suite can, at most, measure the *marginal* signal of the rule file **on top of**
the carve-out. It cannot measure the write-time layer as a whole. A clean whole-layer RED would need
to strip both files at once; `redgreen.fish` is single-file by construction, so that is a v3 harness
change (edit the live `global/CLAUDE.md`), deliberately not attempted here. The honest read of the
no-flip is therefore **"the carve-out — the CLAUDE.md half — plus base habit is already sufficient;
the rule file's hard caps add no *additional* structural signal in this harness,"** not "the
write-time layer does nothing."

### 2. Soft-rule / base-habit redundancy (the `verification` precedent)

Even setting aside the surviving carve-out, Opus 4.8 writes flat guard-clause code by habit on
single pure functions. This is the same outcome the runbook records for `verification` and
`tdd-pragmatic`: a soft rule whose behavior overlaps default model behavior shows GREEN ≈ RED. That
is evidence the rule is partly **redundant with default behavior in this harness**, which is a
valuable finding, not a failure.

### 3. Empty-sandbox greenfield under-reproduces the reported failure

The user reports nesting/naming problems in **large real codebases**. The `--print` empty sandbox
elicits single-function greenfield code, where the arrow anti-pattern is least likely to appear. The
v2 priming ("here is a nested example from our codebase, match the conventions") was built to import
the large-codebase pressure into the sandbox; the transcripts show the strong base model resisting
that pull even without the rule. The gap between harness and reported environment remains a real
external-validity limit on *any* in-sandbox verdict here.

### 4. v1 → v2 iteration history

- **v1** (retired) used two greenfield evals (`guard-clauses-over-arrow-antipattern`,
  `extract-nested-loop`) with no priming. Result: no flip **and** a broken discriminator — the
  `^\s{10,}\S` regex on `extract-nested-loop` false-fired on a legitimate clean 3-deep traversal
  where `ids.push(ticket.id)` honestly sits at 10 spaces, toggling on whether the model used array
  combinators. v1 transcripts: `tests/results/code-clarity-{guard-clauses-over-arrow-antipattern,extract-nested-loop}-v2-2026-09-09T21-4*.md`.
- **v2** dropped `extract-nested-loop` (loops make deep indent ambiguous), and redesigned both evals
  around pure-conditional new siblings primed with a nested example, so any ≥10-space line is
  unambiguously the anti-pattern and the output-only instruction isolates the discriminator to new
  code. The discriminator was de-risked offline against hand-written clean/nested `canRefund`
  fixtures before spending a live window. v2 still shows no flip — but now for the sound reasons in
  limitations 1–3, not a suite defect.

### 5. Tab-indentation caveat (not triggered)

`^\s{10,}` counts a tab as one char, so tab-indented output would under-count nesting. All captured
transcripts are space-indented (verified: `grep -lP '\t'` over the model-output sections returns
nothing), so the caveat does not affect this matrix. It remains a limitation for future runs against
tab-using output.

## Transcript references

- GREEN ×2: `tests/results/code-clarity-guard-clauses-*-v2-2026-09-09T22-00-23.md` (run1) /
  `…T22-01-17.md` (run2) — both evals each.
- RED-strip ×2: `…T22-02-10.md` (run1) / `…T22-02-58.md` (run2) — both evals each; run2 is quoted above.
- v1 (retired, broken-discriminator): `…-v2-2026-09-09T21-48-58.md` … `T21-49-52.md`.
- Per-run logs + master matrix: `/tmp/redgreen-code-clarity-logs/{GREEN,RED-strip}-run*.log`.

## Acceptance (PR #520)

- [x] 2 GREEN runs documented (2/2 evals, flake-stable, discriminator flat)
- [x] 2 RED-strip runs documented (2/2 evals — no flip)
- [x] No-flip confirmed genuine by reading RED transcripts (model resists the style-matching pull
      and cites the surviving CLAUDE.md carve-out) — not contamination, not a trivially-passing suite
- [x] Root cause diagnosed: two-part intervention, single-file RED strips only the rule; base habit +
      surviving carve-out already sufficient
- [x] v1 broken-discriminator + no-flip recorded as the reason for the v2 iteration
- [x] `rules-evals/code-clarity/REDGREEN.md` committed
- [ ] **Ship decision on the write-time layer is the user's call** — see PR #520 discussion. This
      proof establishes the *detection* layer is the verified, load-bearing half; the rule file is
      unproven-but-cheap write-time guidance whose measurable work is done by the CLAUDE.md carve-out.
