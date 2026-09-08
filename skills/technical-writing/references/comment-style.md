# Comment and docstring style

Discipline for code comments and docstrings — the half Google's prose guide
doesn't cover. The harness already instructs matching surrounding comment
density and idiom, and CLAUDE.md's Karpathy #3 (Surgical Changes) covers dead
code; this file adds the intent and maintenance rules.

## The core rule: why, not what

The code already states *what* it does. A comment earns its place only by
adding what the code cannot say:

- **Intent** — why this approach over the obvious alternative.
- **Constraint** — a non-obvious requirement (ordering, a spec clause, a
  hardware quirk, a rate limit).
- **Trade-off** — what was sacrificed and why it was acceptable.
- **Warning** — a footgun for the next editor.

```python
# BAD — restates the code
# increment the counter by one
counter += 1

# GOOD — explains the why
# Retry budget is per-batch, not per-item, so reset it here not in the loop.
counter = 0
```

Never restate the signature in a docstring ("This function takes x and returns
y" adds nothing). Say what it's *for* and any contract the types don't express.

## No comment rot

- A comment that contradicts the code is a **bug** — the reader trusts the
  comment and is misled. Update it in the same change as the code, or delete it.
- When you change code, scan the comments around it: any that no longer hold
  get fixed or removed.
- **Delete dead code; don't comment it out.** Version control is the history.
  (Karpathy #3: remove only what your change orphaned; flag pre-existing dead
  code rather than deleting it unasked.)

## Docstrings for public APIs

- Every exported/public function, class, or module gets a docstring covering
  purpose, non-obvious parameters, return contract, and thrown errors —
  whatever the type signature doesn't already make obvious.
- Match the project's docstring convention (JSDoc, Google-style, reST,
  `///`) — don't introduce a new one.
- Document units, ownership/mutation, nullability, and side effects when the
  types can't.

## When NOT to comment

- Self-evident code needs no comment; a comment restating it is noise that
  rots. Prefer a clearer name or smaller function over a comment that explains
  a confusing one.
- Don't leave commented-out experiments, `console.log`/`print` debris, or
  "changed by X on date" notes.

## TODO / FIXME format

- `TODO(owner): what and why`, optionally with a tracking link:
  `TODO(cantu): batch these writes once #412 lands`.
- An unowned, context-free `TODO` is indistinguishable from abandoned work —
  give it an owner and a reason, or don't leave it.
