# Recording the Anti-Sycophancy Pushback GIF

Step-by-step recipe to produce `assets/anti-sycophancy-pushback.gif`.
Dialog script: [anti-sycophancy-pushback.script.md](anti-sycophancy-pushback.script.md).

## Tool options

Pick one. All produce sub-1 MB GIFs from terminal text.

### Option A — asciinema + agg (recommended)

Smallest output, sharpest text. Records cast file, renders to GIF separately.

```sh
brew install asciinema agg

# Record (Ctrl+D to stop)
asciinema rec assets/anti-sycophancy-pushback.cast

# Render
agg --theme monokai --speed 1.0 \
    assets/anti-sycophancy-pushback.cast \
    assets/anti-sycophancy-pushback.gif
```

`agg` flags worth knowing: `--cols 100 --rows 30` (force size), `--font-size 14`,
`--fps-cap 15` (caps to issue spec). Re-run render without re-recording.

### Option B — vhs (deterministic, scripted)

`vhs` runs a `.tape` file — no live typing. Reproducible if dialog needs revision.

```sh
brew install vhs
vhs assets/anti-sycophancy-pushback.tape  # produces .gif via tape's Output line
```

Tape-file authoring lives outside this recipe; see <https://github.com/charmbracelet/vhs>.

### Option C — terminalizer

Heavier output, per-frame YAML lets you hand-tune timing.

```sh
brew install terminalizer
terminalizer record assets/anti-sycophancy-pushback
terminalizer render assets/anti-sycophancy-pushback
```

### Option D — native macOS + ffmpeg

Highest fidelity, biggest file. Overkill for terminal text but works if the
terminal already runs in a non-standard theme worth preserving.

```sh
# Cmd+Shift+5 → record selection → save .mov
ffmpeg -i input.mov -vf "fps=15,scale=900:-1:flags=lanczos" \
       -loop 0 assets/anti-sycophancy-pushback.gif
```

## Clean-session checklist

Per issue #301 acceptance criteria — recording session must be clean:

- [ ] Run `claude` (not from a worktree with extra plugins)
- [ ] No `/caveman` mode active (it's a plugin layer, not default)
- [ ] No custom statusline (`~/.claude/settings.json` `statusLine` unset or default)
- [ ] No extra plugin marketplaces beyond what `install.sh` provides
- [ ] Terminal width ~100 cols, default theme, monospace font

Quick verify:

```sh
# Confirm no caveman statusline configured
jq '.statusLine // "default"' ~/.claude/settings.json

# Confirm clean plugin set (only the ones install.sh adds)
ls ~/.claude/plugins/ 2>/dev/null
```

## Acceptance gate

After rendering, verify:

```sh
ls -lh assets/anti-sycophancy-pushback.gif    # ≤ 1 MB
ffprobe -v 0 -show_entries format=duration \
        assets/anti-sycophancy-pushback.gif    # ≤ 35s
```

If oversize: re-run `agg` with `--fps-cap 12` and `--cols 90`, or use
`gifsicle -O3 --colors 64` to compress further.

## README wiring

Once GIF exists at `assets/anti-sycophancy-pushback.gif`, replace the
placeholder line in `README.md`:

```diff
-<!-- TODO: insert anti-sycophancy pushback GIF here. Scenario spec in tracking issue. -->
+_Claude holds a recommendation until new evidence flips it._
+
+![Anti-sycophancy pushback demo](assets/anti-sycophancy-pushback.gif)
```

Commit GIF + README edit + this directory together. Close issue #301 in the
PR description.
