# HARD-GATE pattern — external justification and anti-pattern boundary

Backing material for the [HARD-GATE cap](../GOVERNANCE.md#hard-gate-cap)
([ADR #0022](../../adrs/0022-hard-gate-rule-mass-audit.md)) and the
measure-before-sizing discipline
([ADR #0023](../../adrs/0023-discrimination-must-be-measured-before-sizing-hard-gate-rules.md)).
Those decisions justify the cap on *internal* grounds — per-prompt token
load, attention cost, measured discrimination. This file supplies the
*external* grounding the pattern was missing: why a non-bypassable
process gate is a recognized engineering pattern, and the precise
condition under which it degrades into a known anti-pattern.

Loaded on demand, not per prompt. Cited by GOVERNANCE; do not inline
into the always-loaded rule set (doing so would violate the very
load-cost principle ADR #0022 defends).

## What a HARD-GATE is, in established terms

A HARD-GATE is a **forcing function** (Norman, *The Design of Everyday
Things*) implemented as a **control poka-yoke** (Shingo, Toyota
Production System). Control poka-yoke makes the wrong action
mechanically impossible — the canonical example is a web form that will
not submit until required fields are filled. The repo's analogue:
do-not-code-until-a-plan-with-verify-checks-exists.

The pattern's defining property is that it fires **every time, on
judgment-free criteria** — that is the source of its value, not a
limitation. The failure mode it removes is *forgetting under load*:

- **Checklist Manifesto (Gawande).** Mandatory, non-skippable surgical
  and aviation checklists cut error precisely *because* they are not
  discretionary. A checklist a tired operator may skip is not a
  forcing function.
- **Fail-closed / secure-by-default.** Deviation is made impossible or
  *immediately visible*. The named-cost emission contract + sentinel
  banner are the "immediately visible" half — a skip is allowed but
  cannot happen silently.

Core principle, from the poka-yoke literature: the aim is *not* to
"work harder" or "be more careful" but to architect the system so the
correct action is the default and any deviation is impossible or
immediately visible. That is the repo's design intent verbatim.

### Why this does not contradict "don't railroad Claude"

Anthropic's skills guidance warns against over-specifying *method* —
telling the model the exact steps to *solve* a task removes the
adaptivity that makes it useful. HARD-GATEs operate on a different
layer:

| Layer | Guidance | HARD-GATE behavior |
|---|---|---|
| **Method** (how to solve the task) | Give flexibility; don't railroad | Gates do not dictate the solution — they leave it fully open |
| **Process** (high-consequence sequence) | (out of scope of the railroad warning) | Forcing function — justified by the poka-yoke canon |

Railroading constrains *what answer* the model produces. A HARD-GATE
constrains *that deliberation happens before action* and says nothing
about the answer. No conflict.

## The anti-pattern boundary — alert fatigue

The closest real-world mirror to a non-bypassable gate is the
**hard-stop alert in clinical decision support (CDS)**. The evidence is
blunt and worth internalizing, because every condition that turns a CDS
hard-stop into harm has a direct analogue here:

- Hard stops "often disrupt clinical flow and generate **unsafe
  workarounds**" (systematic review, PMC6915824).
- Alert acceptance drops **~30% per additional alert** per encounter,
  and **~10% per 5-point rise** in proportion of repeated alerts (PMC5387195).
- The drivers of over-override: **low specificity (high false-positive
  rate)**, **ambiguous trigger reason**, and **broad shared logic
  firing on inapplicable contexts** (the textbook case: a
  pregnancy-related alert firing on older men due to poor filtering).

Translated to this repo:

| CDS failure driver | HARD-GATE analogue | Symptom |
|---|---|---|
| High false-positive rate | Gate fires on trivial / out-of-scope work | Model or user reaches for the sentinel / named-cost skip *reflexively* — bypass becomes habit, the gate becomes theatre |
| Ambiguous trigger reason | Skip contract unclear on what cost is being named | Skips rubber-stamped without engaging the gate's intent |
| Broad shared logic | A gate whose criteria match contexts it was not designed for | Over-firing → fatigue → blind override |

The anti-pattern is **not** "having hard gates." It is **keeping a hard
gate that fires often and discriminates rarely.** That trains the
operator to bypass on reflex, which is strictly worse than no
gate — it adds friction *and* loses the protection.

## Staying on the correct side of the boundary

The CDS literature's prescribed mitigations — **tiering** (soft →
hard), **role/context tailoring**, and **specificity** — are already
the repo's defenses:

- **Scope Calibration** (Trivial tier skips gates) = the soft/hard
  tiering CDS recommends. Keeps false-positive rate down.
- **Named-cost emission contract** = the attestation-click "soft stop"
  the literature names as the middle ground between rigid enforcement
  and flow.
- **HARD-GATE cap = 8** = an explicit alert-volume ceiling, directly
  countering the ~30%-per-alert acceptance decay.
- **ADR #0005 / #0019 discriminating-signal requirement** = specificity
  enforcement *before* a gate is allowed to exist.

### The internal canary

The strongest evidence the repo is not in anti-pattern territory is
that its own measurement has already caught over-gating: the
`memory-discipline` RED/GREEN audit (PR #461, ADR #0023) found **only 2
of 8 evals discriminate** — six "rules" were base model competence
(passed with *and* without the rule). The rule was shrunk 75 → 26 LOC
and the suite retiered. The CDS anti-pattern is keeping unmeasured hard
stops; the repo measures and prunes. That measurement loop is the line
between forcing-function and theatre.

## Operational guard (the validation that actually matters)

The question is never "is the HARD-GATE pattern OK" — the canon settles
that. The question is **"does each individual gate still
discriminate."** Three conditions keep the set on the right side:

1. **No 9th gate without ADR #0005 discriminating signal** at its own
   boundary (already policy — GOVERNANCE three-condition gate).
2. **Periodically re-run RED/GREEN on existing gates.** Discrimination
   *decays* as the base model improves — today's discriminating gate is
   tomorrow's base competence. A gate that no longer discriminates is a
   prune candidate, not a keep.
3. **Watch bypass frequency.** Rising sentinel / named-cost-skip usage
   is the alert-fatigue signal. If operators bypass often, the gate is
   either mis-scoped (firing on the wrong contexts) or no longer
   earning its friction.

The one move the canon says is unsafe: keeping a hard stop you have not
measured. ADR #0023 exists so that does not happen.

## Sources

- Poka-yoke / forcing functions — Shingo (TPS); Norman, *The Design of
  Everyday Things*. Overview: <https://en.wikipedia.org/wiki/Poka-yoke>
- Gawande, *The Checklist Manifesto* — mandatory non-skippable
  checklists in surgery / aviation.
- Hard-stop alerts, efficacy and unintended consequences (systematic
  review): <https://pmc.ncbi.nlm.nih.gov/articles/PMC6915824/>
- Workload, complexity, repeated alerts and alert fatigue:
  <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5387195/>
- Alert fatigue reduced via interaction design + role tailoring (JAMIA
  systematic review):
  <https://academic.oup.com/jamia/article/26/10/1141/5519579>
